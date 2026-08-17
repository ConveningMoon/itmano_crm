import 'server-only'
import { z } from 'zod'
import { ApiError } from '../errors'
import { toIso } from '../schemas/common'
import {
  CreateLeadSchema, UpdateLeadSchema, CreateNoteSchema, CreateDraftSchema,
} from '../schemas/write'
import { getLead } from './leads'
import type { AgentContext } from '../auth'

/**
 * Convierte un error de PostgREST en `upstream_error` DEJANDO RASTRO. El cliente
 * recibe un mensaje genérico —no se filtran detalles del esquema— pero el
 * servidor registra el motivo real; sin esto, un fallo de constraint o de policy
 * es indistinguible de cualquier otro 500.
 */
function fallo(operacion: string, error: { message: string; code?: string }): never {
  console.error(JSON.stringify({
    service: 'agent-api', operation: operacion,
    error: error.code ?? 'db_error', detail: error.message,
  }))
  throw new ApiError('upstream_error', `${operacion} failed`)
}

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('invalid_arguments', 'Invalid request body', {
      issues: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data
}

async function readBody(req: Request): Promise<unknown> {
  const body = await req.json().catch(() => null)
  if (body === null || typeof body !== 'object') {
    throw new ApiError('invalid_arguments', 'Body must be a JSON object')
  }
  return body
}

/** El agente debe existir y pertenecer al tenant. La RLS ya acota la búsqueda. */
async function requireAgent(ctx: AgentContext, agentId: string): Promise<void> {
  const { data } = await ctx.db.from('agents').select('id').eq('id', agentId).maybeSingle()
  if (!data) {
    throw new ApiError('unprocessable', `No agent with id '${agentId}' in this tenant`, {
      hint: 'Los ids válidos están en GET /agent/v1/metadata → owners',
    })
  }
}

// ── POST /leads ───────────────────────────────────────────────────────────────

export async function createLead(ctx: AgentContext, req: Request): Promise<string> {
  const input = parse(CreateLeadSchema, await readBody(req))

  await requireAgent(ctx, input.owner)

  const { data: existente } = await ctx.db
    .from('leads').select('id').eq('email', input.email).maybeSingle()
  if (existente) {
    throw new ApiError('unprocessable', 'A lead with this email already exists in this tenant', {
      existing_lead_id: existente.id,
    })
  }

  const { extractFitDimensions, extractBudgetAmount, normalizeIntent } =
    await import('@/lib/services/intake-fit')
  const { getBusinessProfile } = await import('@/lib/data/business-profile')

  const intent  = normalizeIntent(input.intent)
  const perfil  = await getBusinessProfile(ctx.tenantId)
  const fit     = extractFitDimensions(intent, input.form_answers, perfil)

  // budget_amount es GENERATED ALWAYS desde metadata->'budget_amount' y sólo
  // cuenta si el JSON es de tipo number. Se escribe como número, nunca string.
  const monto = input.budget_amount ?? extractBudgetAmount(input.form_answers)
  const metadata: Record<string, unknown> = {}
  if (monto !== null && monto !== undefined) metadata.budget_amount = monto

  const leadId = crypto.randomUUID()

  const { error } = await ctx.db.from('leads').insert({
    id:            leadId,
    tenant_id:     ctx.tenantId,
    agent_id:      input.owner,
    first_name:    input.first_name,
    last_name:     input.last_name,
    email:         input.email,
    phone:         input.phone ?? null,
    language:      input.language,
    notes:         input.notes ?? null,
    stage:         'nuevo',
    // El check de la columna no admite un valor propio para esta superficie, y
    // 'direct' es lo que ya usa la creación manual del CRM. La procedencia real
    // queda registrada en el evento lead_created, con via: 'agent_api'.
    traffic_source: 'direct',
    fit_profile:   fit,
    metadata,
    peak_score:    0,
    current_score: 0,
  })
  if (error) fallo('lead insert', error)

  // Bitácora. NO se llama a enrollLeadInSequence: esta superficie no dispara
  // envíos, y el test de guardas verifica que no se importe ningún servicio de
  // email en todo el árbol.
  const { emitLeadCreated } = await import('@/lib/services/emit-lead-created')
  await emitLeadCreated(ctx.db as never, {
    leadId, tenantId: ctx.tenantId, via: 'agent_api', actorUserId: null,
  })

  // form_baseline sólo si vino calificación de verdad: darlo por un lead con
  // nombre y correo sería regalar 10 puntos de engagement que nadie ganó.
  if (input.form_answers?.length) {
    const { emitFormBaselineOnce } = await import('@/lib/services/emit-form-baseline')
    await emitFormBaselineOnce(ctx.db as never, leadId, ctx.tenantId)
  }

  return leadId
}

// ── PATCH /leads/{id} ─────────────────────────────────────────────────────────

export async function updateLead(
  ctx: AgentContext, id: string, req: Request,
): Promise<void> {
  const input = parse(UpdateLeadSchema, await readBody(req))

  await getLead(ctx, id)   // lanza not_found si no es visible
  if (input.owner) await requireAgent(ctx, input.owner)

  const cambios: Record<string, unknown> = {}
  if (input.stage) cambios.stage = input.stage
  if (input.owner) cambios.agent_id = input.owner

  const { error } = await ctx.db.from('leads').update(cambios).eq('id', id)
  if (error) fallo('lead update', error)

  // El historial NO se escribe aquí. El trigger trg_lead_status_history ya
  // registra toda transición de etapa, y marca source = 'agent' cuando el
  // cambio viene de la aplicación (recompute_lead_score es quien pone
  // 'trigger'). Insertarlo a mano duplicaba cada movimiento.
}

// ── POST /notes ───────────────────────────────────────────────────────────────

export async function createNote(
  ctx: AgentContext, req: Request, idempotencyKey: string | null,
): Promise<{ id: string; lead_id: string; body: string; created_at: string }> {
  const input = parse(CreateNoteSchema, await readBody(req))

  let leadId = input.target_id
  if (input.target_type === 'deal') {
    const { data } = await ctx.db
      .from('purchase_processes').select('lead_id').eq('id', input.target_id).maybeSingle()
    if (!data) throw new ApiError('not_found', `No deal with id '${input.target_id}'`)
    leadId = data.lead_id as string
  } else {
    await getLead(ctx, leadId)  // lanza not_found si no es visible
  }

  const { data, error } = await ctx.db.from('lead_events').insert({
    lead_id:     leadId,
    tenant_id:   ctx.tenantId,
    type:        'agent_note',
    description: input.body,
    points:      0,
    // Reusar la Idempotency-Key como dedup_key aprovecha el índice único que ya
    // protege lead_events de reintentos de webhook.
    dedup_key:   idempotencyKey ? `agent_note:${idempotencyKey}` : null,
    metadata:    { source: 'agent_api', target_type: input.target_type },
  }).select('id, lead_id, description, created_at').single()

  if (error) fallo('note insert', error)

  return {
    id:         data.id as string,
    lead_id:    data.lead_id as string,
    body:       data.description as string,
    created_at: toIso(data.created_at as string)!,
  }
}

// ── POST /emails/draft ────────────────────────────────────────────────────────

export async function createDraft(
  ctx: AgentContext, req: Request,
): Promise<{ id: string; lead_id: string; subject: string; body: string; created_at: string; status: 'draft' }> {
  const input = parse(CreateDraftSchema, await readBody(req))

  await getLead(ctx, input.lead_id)  // lanza not_found si no es visible

  const { data, error } = await ctx.db.from('agent_email_drafts').insert({
    tenant_id: ctx.tenantId,
    lead_id:   input.lead_id,
    subject:   input.subject,
    body:      input.body,
  }).select('id, lead_id, subject, body, created_at').single()

  if (error) fallo('draft insert', error)

  // Se guarda y se devuelve. No se envía: ninguna ruta de /agent/v1 tiene
  // acceso a un transporte de email, y hay un test que lo verifica por grep.
  return {
    id:         data.id as string,
    lead_id:    data.lead_id as string,
    subject:    data.subject as string,
    body:       data.body as string,
    created_at: toIso(data.created_at as string)!,
    status:     'draft',
  }
}
