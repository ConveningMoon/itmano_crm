import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { assertAiWithinLimit } from '@/lib/services/ai-limit'
import { recordAiUsage, webSearchCostUsd, computeCostUsd } from '@/lib/services/ai-usage'
import { parseSourceDomains, canGenerateWithAi } from '../source-domains'
import { researchMarket } from './research'
import { draftEdition } from './draft'
import type { NewsletterContent, NewsletterSource } from '../content'
import type { TenantContext } from '@/lib/auth/tenant-context'

// Orquesta los dos pasos y deja el rastro en el ledger de IA.
//
// Orden deliberado, el mismo de studio/generate.ts: validar → gate de IA →
// investigar → redactar. El gate va ANTES de gastar un solo token.

const MODEL = 'claude-sonnet-5'

// Columnas verificadas contra el esquema real (database.types.ts): `tenants` NO
// tiene `market` ni `brand_voice`. El mercado se deriva de las zonas declaradas
// (migración 087) y la voz sale de `description`, la descripción libre de la
// agencia que se edita en Ajustes → Tu negocio.
const TENANT_COLUMNS = columns('tenants', [
  'name', 'description', 'newsletter_source_domains',
  'primary_areas', 'secondary_areas',
])

export interface GeneratedDraft {
  title:    string
  dek:      string
  content:  NewsletterContent
  sources:  NewsletterSource[]
  dataAsOf: string | null
  /** Trazabilidad: qué se pidió, con qué fuentes y cuánto costó. */
  aiRun: {
    model:    string
    topic:    string | null
    domains:  string[]
    searches: number
    at:       string
  }
}

export async function generateNewsletterDraft(args: {
  ctx:      TenantContext
  topic:    string | null
  language: string
}): Promise<{ ok: true; data: GeneratedDraft } | { ok: false; error: string }> {
  const { ctx } = args
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant primero.' }

  const db = createAdminClient()
  const { data: tenantRow } = await db
    .from('tenants').select(TENANT_COLUMNS).eq('id', ctx.tenant_id).maybeSingle()

  // reason: el cliente de Supabase no está tipado en este repo; columns() ya
  // validó la lista contra el esquema, que es lo que el cast podría esconder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenant = tenantRow as any
  if (!tenant) return { ok: false, error: 'No se pudo leer la configuración de la agencia.' }

  const { domains } = parseSourceDomains(tenant.newsletter_source_domains)
  if (!canGenerateWithAi(domains)) {
    return {
      ok: false,
      error: 'Todavía no hay fuentes declaradas para tu mercado. Configúralas en Ajustes → Tu negocio antes de generar.',
    }
  }

  // El gate de presupuesto, ANTES de gastar nada.
  const blocked = await assertAiWithinLimit(ctx)
  if (blocked) return blocked

  const brandName = String(tenant.name ?? 'la agencia')
  const areas       = Array.isArray(tenant.primary_areas) ? (tenant.primary_areas as string[]) : []
  const secundarias = Array.isArray(tenant.secondary_areas) ? (tenant.secondary_areas as string[]) : []
  // El "mercado" de la agencia son sus zonas declaradas: es el dato que ya
  // existe y el que de verdad acota la búsqueda.
  const market = [...areas, ...secundarias].join(', ')
  // La descripción libre de la agencia hace de guía de voz: es lo que el propio
  // tenant escribió sobre sí mismo.
  const voice = typeof tenant.description === 'string' && tenant.description.trim()
    ? tenant.description.trim()
    : null

  // ── Paso 1: investigar ────────────────────────────────────────────────────
  let dossier
  try {
    dossier = await researchMarket({
      topic: args.topic, language: args.language, market, areas, domains, brandName,
    })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: `No se pudo investigar el mercado: ${detalle}` }
  }

  // Se registra el costo de la investigación AUNQUE la redacción falle después:
  // esos tokens y esas búsquedas ya se facturaron.
  //
  // `costUsdOverride` es obligatorio aquí, no un simple paso-por: el costo de
  // esta llamada no es sólo tokens (recordAiUsage lo calcularía con `usage`
  // solo) ni sólo búsquedas (`webSearchCostUsd` solo) — es AMBOS a la vez, y
  // Anthropic cobra los dos. Pasar sólo uno de los dos subestimaría el gasto
  // real exactamente como lo hacía la versión anterior, que ignoraba los
  // tokens de investigación por completo.
  await recordAiUsage({
    tenantId: ctx.tenant_id,
    userId:   ctx.user_id,
    feature:  'newsletter_research',
    model:    MODEL,
    usage:    { input_tokens: dossier.usage.input, output_tokens: dossier.usage.output },
    costUsdOverride: computeCostUsd(MODEL, {
      input_tokens: dossier.usage.input, output_tokens: dossier.usage.output,
    }) + webSearchCostUsd(dossier.searches),
    metadata: { searches: dossier.searches, domains: domains.length, topic: dossier.topic },
  })

  if (dossier.findings.length === 0) {
    return {
      ok: false,
      error: 'La búsqueda no encontró datos respaldables en tus fuentes. Prueba con otro tema o añade más fuentes.',
    }
  }

  // ── Paso 2: redactar ──────────────────────────────────────────────────────
  let draft
  try {
    draft = await draftEdition({ dossier, language: args.language, brandName, voice })
  } catch (e) {
    const detalle = e instanceof Error ? e.message : 'error desconocido'
    return { ok: false, error: `No se pudo redactar la edición: ${detalle}` }
  }

  await recordAiUsage({
    tenantId: ctx.tenant_id,
    userId:   ctx.user_id,
    feature:  'newsletter_draft',
    model:    MODEL,
    usage:    { input_tokens: draft.usage.input, output_tokens: draft.usage.output },
    metadata: { topic: dossier.topic, sources: draft.sources.length },
  })

  return {
    ok: true,
    data: {
      title:    draft.title,
      dek:      draft.dek,
      content:  draft.content,
      sources:  draft.sources,
      dataAsOf: draft.dataAsOf,
      aiRun: {
        model:    MODEL,
        topic:    args.topic,
        domains,
        searches: dossier.searches,
        at:       new Date().toISOString(),
      },
    },
  }
}
