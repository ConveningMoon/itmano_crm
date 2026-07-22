'use server'

import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'
import { recordAiUsage } from '@/lib/services/ai-usage'
import { assertAiWithinLimit } from '@/lib/services/ai-limit'
import { createPlatformRequest } from '@/lib/services/platform-requests'
import { HostedPageConfigSchema } from '@/lib/hosted-page'

// ─── Página alojada del canal (constructor — migración 060) ───────────────────
// Guarda acquisition_channels.hosted_page. Escriben owner/super_admin
// (requireWriteAccess bloquea rol 'agent', igual que el resto de mutaciones de
// canales). El slug de la URL es (tenants.slug, channels.slug) — único por
// construcción.

export async function updateHostedPage(
  channelId: string,
  rawConfig: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const parsed = HostedPageConfigSchema.safeParse(rawConfig)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los campos de la página.' }
  }

  const supabase = createAdminClient()
  let q = supabase
    .from('acquisition_channels')
    .select('id, channel_type')
    .eq('id', channelId)
  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)
  const { data: channel } = await q.maybeSingle()
  if (!channel) return { ok: false, error: 'Canal no encontrado' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!['lead_magnet', 'event', 'contact_form'].includes((channel as any).channel_type)) {
    return { ok: false, error: 'Este tipo de canal no tiene página alojada.' }
  }

  const { error } = await supabase
    .from('acquisition_channels')
    .update({ hosted_page: parsed.data })
    .eq('id', channelId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/sources')
  return { ok: true }
}

// ─── Marcar página como conectada por ITMANO (solo super_admin) ───────────────
// Para tenants gestionados en persona: oculta las opciones de construcción al
// tenant. target: 'channel' | 'property' (migración 061).

export async function setPageManagedByItmano(
  target: 'channel' | 'property',
  id: string,
  managed: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return { ok: false, error: 'Solo ITMANO puede marcar esto.' }

  const supabase = createAdminClient()
  const table = target === 'channel' ? 'acquisition_channels' : 'properties'
  const { error } = await supabase
    .from(table)
    .update({ page_managed_by_itmano: managed })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/sources')
  revalidatePath('/properties')
  return { ok: true }
}

// ─── Solicitud de creación de página a ITMANO ─────────────────────────────────
// Opción 3 del tab Página: se registra como platform_request kind='page' (tab
// Páginas en /solicitudes del super_admin, con aviso por Telegram).

const PageRequestSchema = z.object({
  subject: z.string().trim().min(3).max(160),
  message: z.string().trim().min(10, 'Cuéntanos qué necesitas — mínimo 10 caracteres.').max(4000),
})

export async function requestPageBuild(
  input: { subject: string; message: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const parsed = PageRequestSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los campos.' }

  const supabase = createAdminClient()
  const authClient = await createClient()
  const [{ data: tenant }, { data: { user } }] = await Promise.all([
    supabase.from('tenants').select('name').eq('id', ctx.tenant_id).maybeSingle(),
    authClient.auth.getUser(),
  ])

  return createPlatformRequest({
    kind:            'page',
    tenant_id:       ctx.tenant_id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenant_name:     ((tenant as any)?.name as string | undefined) ?? ctx.tenant_id,
    requester_email: user?.email ?? '(desconocido)',
    subject:         parsed.data.subject,
    message:         parsed.data.message,
  })
}

// ─── Imagen de la página alojada (bucket tenant-assets) ───────────────────────
// Portada del material, foto del agente, etc. Igual patrón que el logo del
// tenant: bucket público, path por tenant, service role.

const HOSTED_IMG_BUCKET = 'tenant-assets'
const MAX_IMG_BYTES = 4 * 1024 * 1024 // 4 MB
const IMG_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
}

export async function uploadHostedImage(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'Archivo no válido' }
  if (!IMG_EXT[file.type]) return { ok: false, error: 'La imagen debe ser PNG, JPG o WebP.' }
  if (file.size > MAX_IMG_BYTES) return { ok: false, error: 'La imagen supera el máximo de 4 MB.' }

  const supabase = createAdminClient()
  const path = `${ctx.tenant_id}/hosted/${crypto.randomUUID()}.${IMG_EXT[file.type]}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error } = await supabase.storage
    .from(HOSTED_IMG_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (error) return { ok: false, error: error.message }

  const { data: pub } = supabase.storage.from(HOSTED_IMG_BUCKET).getPublicUrl(path)
  return { ok: true, url: pub.publicUrl }
}

// Extrae el path del objeto desde una URL pública del bucket de assets.
function hostedPathFromPublicUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const marker = `/${HOSTED_IMG_BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  const raw = url.slice(i + marker.length)
  try { return decodeURIComponent(raw) } catch { return raw }
}

// Borra imágenes de páginas alojadas por sus URLs públicas. Se usa para
// reconciliar Storage cuando el constructor reemplaza/quita una imagen o se
// cancela con subidas de la sesión (igual que en propiedades). Scoped a la
// carpeta `<tenant>/hosted/` del tenant — nunca borra fuera de ella. Best-effort.
export async function deleteHostedImages(
  urls: string[],
): Promise<{ ok: true }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return { ok: true } // sin permiso de escritura: no-op silencioso
  if (!ctx.tenant_id) return { ok: true }

  const prefix = `${ctx.tenant_id}/hosted/`
  const paths: string[] = []
  for (const url of urls) {
    const p = hostedPathFromPublicUrl(url)
    // Seguridad: solo dentro de la carpeta hosted del propio tenant.
    if (p && p.startsWith(prefix)) paths.push(p)
  }
  if (paths.length === 0) return { ok: true }

  const supabase = createAdminClient()
  const { error } = await supabase.storage.from(HOSTED_IMG_BUCKET).remove(paths)
  if (error) {
    console.error(JSON.stringify({ service: 'delete-hosted-images', tenant_id: ctx.tenant_id, error: error.message }))
  }
  return { ok: true }
}

// ─── Textos de la página con IA ───────────────────────────────────────────────
// Rellena headline/subheadline/bullets/CTA/éxito/beneficios desde la
// descripción del material (o el texto que el usuario pegue). Mismo patrón que
// generateEmailDraft: tool call forzado + límite mensual + registro de uso.

const AI_MODEL = 'claude-sonnet-5'

// Tool de extracción por tipo de canal. Campos comunes + los específicos del
// template (lead magnet completo, evento con datos logísticos). Los testimonios
// NUNCA los genera la IA — son citas reales de clientes que escribe el agente.
function buildPageCopyTool(channelType: string) {
  const properties: Record<string, unknown> = {
    language:        { type: 'string', enum: ['es', 'en', 'pt'], description: 'Idioma detectado de la descripción (el copy se escribe en ese idioma)' },
    headline:        { type: 'string', description: 'Título principal, directo y específico (máx 120 caracteres)' },
    subheadline:     { type: 'string', description: 'Subtítulo de 1–2 frases' },
    bullets:         { type: 'array', items: { type: 'string' }, description: '3–4 beneficios concretos, uno por línea' },
    cta_label:       { type: 'string', description: 'Texto del botón (máx 40 caracteres)' },
    success_message: { type: 'string', description: 'Mensaje tras enviar el formulario' },
  }
  const required = ['language', 'headline', 'subheadline', 'bullets', 'cta_label', 'success_message']

  if (channelType === 'lead_magnet') {
    Object.assign(properties, {
      badge:             { type: 'string', description: 'Eyebrow corto del hero (ej.: "Guía gratuita · Hampton Roads, Virginia")' },
      microcopy:         { type: 'string', description: 'Microcopy bajo el botón (ej.: "100% gratis · Sin compromiso")' },
      benefits_title:    { type: 'string', description: 'Título de la sección "qué contiene"' },
      benefits_subtitle: { type: 'string', description: 'Subtítulo de 1–2 frases de esa sección' },
      benefits: {
        type: 'array',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, desc: { type: 'string' } },
          required: ['title', 'desc'],
        },
        description: '4–6 tarjetas de "qué contiene / qué obtienes"',
      },
      form_title:          { type: 'string', description: 'Encabezado de la sección del formulario (ej.: "Cuéntanos un poco sobre ti y recibe la guía")' },
      form_subtitle:       { type: 'string', description: 'Frase de apoyo del formulario' },
      final_cta_title:     { type: 'string', description: 'Título del CTA final de la página' },
      final_cta_paragraph: { type: 'string', description: 'Párrafo breve del CTA final' },
    })
    required.push('badge', 'microcopy', 'benefits_title', 'benefits', 'form_title', 'final_cta_title', 'final_cta_paragraph')
  } else if (channelType === 'event') {
    Object.assign(properties, {
      event_short_description: { type: 'string', description: 'Descripción corta del evento (2–3 frases)' },
      event_date:     { type: 'string', description: 'Fecha del evento SI aparece en la descripción (texto humano, ej. "Sábado 12 de octubre"); vacío si no' },
      event_time:     { type: 'string', description: 'Hora del evento SI aparece en la descripción; vacío si no' },
      event_location: { type: 'string', description: 'Lugar del evento SI aparece en la descripción; vacío si no' },
    })
    required.push('event_short_description')
  } else {
    // contact_form: solo el copy base + tarjetas opcionales.
    Object.assign(properties, {
      benefits: {
        type: 'array',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, desc: { type: 'string' } },
          required: ['title', 'desc'],
        },
        description: '3–4 tarjetas de "por qué escribirnos" (opcional)',
      },
    })
  }

  return {
    name: 'compose_landing_copy',
    description: 'Devuelve el copy completo de una landing page de captación inmobiliaria.',
    input_schema: { type: 'object' as const, properties, required },
  }
}

export interface HostedPageCopy {
  language:        'es' | 'en' | 'pt' | ''
  headline:        string
  subheadline:     string
  bullets:         string[]
  cta_label:       string
  success_message: string
  benefits:        { title: string; desc: string }[]
  badge:               string
  microcopy:           string
  benefits_title:      string
  benefits_subtitle:   string
  form_title:          string
  form_subtitle:       string
  final_cta_title:     string
  final_cta_paragraph: string
  event: { date: string; time: string; location: string; short_description: string }
}

export type PageCopyResult =
  | { ok: true; copy: HostedPageCopy }
  | { ok: false; error: string }

export async function generateHostedPageCopy(input: {
  channelType: string
  description: string
  tenantName?: string
  agentName?: string
  // Archivo opcional que la IA usa como fuente adicional: PDF/imagen en base64,
  // o texto plano. La descripción sigue siendo obligatoria.
  attachment?: { kind: 'pdf' | 'image' | 'text'; data: string; mediaType: string }
}): Promise<PageCopyResult> {
  const ctx = await getCurrentTenantContext()
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'La generación con IA no está configurada.' }
  }
  const overLimit = await assertAiWithinLimit(ctx)
  if (overLimit) return overLimit

  const description = input.description?.trim()
  if (!description) return { ok: false, error: 'Describe el material o el objetivo de la página.' }
  if (description.length > 6000) return { ok: false, error: 'La descripción es demasiado larga.' }
  // Límite defensivo del archivo (base64 ~1.37× el binario → ~10MB).
  const attachment = input.attachment
  const IMAGE_MEDIA = ['image/png', 'image/jpeg', 'image/webp']
  if (attachment && attachment.data.length > 14_000_000) {
    return { ok: false, error: 'El archivo supera el límite de 10 MB.' }
  }
  if (attachment && attachment.kind === 'image' && !IMAGE_MEDIA.includes(attachment.mediaType)) {
    return { ok: false, error: 'Formato de imagen no admitido. Usa PNG, JPG o WebP.' }
  }

  const typeLabel = { lead_magnet: 'lead magnet (material descargable gratuito)', event: 'evento presencial', contact_form: 'formulario de contacto' }[input.channelType] ?? 'página de captación'

  // Contexto de negocio (064): descripción de la agencia (mercado, perfil de
  // comprador, tono) y del agente responsable. Da relevancia real al copy.
  const supabaseCtx = createAdminClient()
  let agencyDescription = ''
  let agentDescription  = ''
  if (ctx.tenant_id) {
    const { data: tn } = await supabaseCtx.from('tenants').select('description').eq('id', ctx.tenant_id).maybeSingle()
    agencyDescription = (((tn as { description?: string | null } | null)?.description) ?? '').trim().slice(0, 2000)
    if (input.agentName) {
      const { data: ag } = await supabaseCtx.from('agents').select('description').eq('tenant_id', ctx.tenant_id).eq('name', input.agentName).maybeSingle()
      agentDescription = (((ag as { description?: string | null } | null)?.description) ?? '').trim().slice(0, 1500)
    }
  }

  const prompt = [
    `Escribe el copy de una landing page inmobiliaria de captación para un ${typeLabel}.`,
    'Idioma: detecta el idioma de la descripción y escribe TODO el copy en ese mismo idioma (si es español, español neutro latino). Devuélvelo en el campo `language`.',
    'Tono: cercano, específico, honesto — sin hype, sin emojis, sin promesas exageradas.',
    input.tenantName ? `Agencia: ${input.tenantName}.` : null,
    agencyDescription ? `Contexto y mercado de la agencia (úsalo para que el copy sea relevante; NO inventes datos fuera de esto):\n${agencyDescription}` : null,
    input.agentName ? `Agente responsable: ${input.agentName}.` : null,
    agentDescription ? `Sobre el agente (voz y especialidad): ${agentDescription}` : null,
    attachment ? 'Se adjunta un archivo con material de referencia — úsalo como fuente principal de los hechos, complementado por la descripción.' : null,
    attachment?.kind === 'text' ? `Contenido del archivo de referencia:\n${attachment.data}` : null,
    input.channelType === 'event' ? 'Extrae fecha, hora y lugar SOLO si aparecen en la descripción — nunca los inventes.' : null,
    '',
    'Descripción del material / objetivo (base de todo el copy):',
    description,
  ].filter((l): l is string => l !== null).join('\n')

  // Contenido del mensaje: archivo (si hay: PDF/imagen como bloque; el texto ya
  // va dentro del prompt) + prompt.
  const userContent: Anthropic.ContentBlockParam[] = []
  if (attachment?.kind === 'pdf') {
    userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: attachment.data } })
  } else if (attachment?.kind === 'image') {
    userContent.push({ type: 'image', source: { type: 'base64', media_type: attachment.mediaType as 'image/png' | 'image/jpeg' | 'image/webp', data: attachment.data } })
  }
  userContent.push({ type: 'text', text: prompt })

  try {
    const anthropic = new Anthropic()
    const message = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 3500,
      thinking: { type: 'disabled' },
      tools: [buildPageCopyTool(input.channelType)],
      tool_choice: { type: 'tool', name: 'compose_landing_copy' },
      messages: [{ role: 'user', content: userContent }],
    })

    await recordAiUsage({
      tenantId: ctx.tenant_id,
      userId:   ctx.user_id,
      feature:  'hosted_page_copy',
      model:    AI_MODEL,
      usage:    message.usage,
      metadata: { channel_type: input.channelType },
    })

    const block = message.content.find(b => b.type === 'tool_use')
    if (!block || block.type !== 'tool_use') return { ok: false, error: 'La IA no devolvió el copy. Intenta de nuevo.' }
    const t = block.input as Record<string, unknown>

    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '')
    const copy: HostedPageCopy = {
      language:        (['es', 'en', 'pt'] as const).find(l => l === t.language) ?? '',
      headline:        str(t.headline, 140),
      subheadline:     str(t.subheadline, 300),
      bullets:         Array.isArray(t.bullets) ? t.bullets.filter((b): b is string => typeof b === 'string').map(b => b.trim().slice(0, 160)).filter(Boolean).slice(0, 6) : [],
      cta_label:       str(t.cta_label, 60),
      success_message: str(t.success_message, 400),
      benefits:        Array.isArray(t.benefits)
        ? t.benefits
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .map((b: any) => ({ title: str(b?.title, 90), desc: str(b?.desc, 220) }))
            .filter(b => b.title)
            .slice(0, 6)
        : [],
      badge:               str(t.badge, 90),
      microcopy:           str(t.microcopy, 140),
      benefits_title:      str(t.benefits_title, 140),
      benefits_subtitle:   str(t.benefits_subtitle, 400),
      form_title:          str(t.form_title, 140),
      form_subtitle:       str(t.form_subtitle, 300),
      final_cta_title:     str(t.final_cta_title, 140),
      final_cta_paragraph: str(t.final_cta_paragraph, 400),
      event: {
        date:              str(t.event_date, 60),
        time:              str(t.event_time, 60),
        location:          str(t.event_location, 200),
        short_description: str(t.event_short_description, 600),
      },
    }
    if (!copy.headline) return { ok: false, error: 'El copy generado está incompleto. Intenta con más detalle.' }
    return { ok: true, copy }
  } catch (e) {
    console.error(JSON.stringify({ service: 'hosted-page-copy', error: e instanceof Error ? e.message : 'unknown' }))
    return { ok: false, error: 'No se pudo generar el copy con IA. Intenta más tarde.' }
  }
}

// ─── Toggle a submission's responded flag (event / contact_form only) ─────────

export async function toggleSubmissionResponded(
  submissionId: string
): Promise<{ ok: true; responded: boolean } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  // Fetch submission (tenant-scoped) + its channel type
  let q = supabase
    .from('form_submissions')
    .select('id, responded, acquisition_channels(channel_type)')
    .eq('id', submissionId)
  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)
  const { data: sub } = await q.maybeSingle()
  if (!sub) return { ok: false, error: 'Solicitud no encontrada' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sub as any
  const channelRel = Array.isArray(s.acquisition_channels) ? s.acquisition_channels[0] : s.acquisition_channels
  if (channelRel?.channel_type === 'lead_magnet') {
    return { ok: false, error: 'Los lead magnets no usan estado de respuesta' }
  }

  const newResponded = !s.responded
  let uq = supabase
    .from('form_submissions')
    .update({ responded: newResponded, responded_at: newResponded ? new Date().toISOString() : null })
    .eq('id', submissionId)
  if (ctx.tenant_id) uq = uq.eq('tenant_id', ctx.tenant_id)

  const { error } = await uq
  if (error) return { ok: false, error: error.message }

  // The submission surfaces on both the source profile and the lead profile.
  revalidatePath('/sources/[slug]', 'page')
  revalidatePath('/leads/[id]', 'page')
  return { ok: true, responded: newResponded }
}

// Validates an optional channel owner agent_id belongs to the tenant. null/''/
// undefined → "Toda la agencia" (no agent). Returns the value to store, or an error.
async function resolveChannelAgentId(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  agentId: string | null | undefined,
): Promise<string | null | { error: string }> {
  const id = agentId?.trim()
  if (!id) return null
  const { data } = await supabase.from('agents').select('id').eq('id', id).eq('tenant_id', tenantId).maybeSingle()
  if (!data) return { error: 'El agente seleccionado no pertenece a este tenant' }
  return id
}

function genPublicId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return `chn_${s}`
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Insert a source-CRUD notification (no lead_id). Triggers Telegram via the
// notifications webhook. Failure is logged, never blocks the parent action.
async function insertSourceNotification(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  type: 'event_added' | 'event_deleted' | 'lm_added' | 'lm_deleted',
  message: string,
) {
  const { error } = await supabase.from('notifications').insert({ tenant_id: tenantId, type, message })
  if (error) {
    console.error(JSON.stringify({ service: 'sources-actions', type, error: error.message }))
  }
}

// ─── Create Lead Magnet channel + empty email sequence ────────────────────────

export interface CreateLeadMagnetResult {
  ok: true
  channelId: string
  publicId: string
  slug: string
  sequenceId: string
  embedSnippet: string
}

export async function createLeadMagnet(fields: {
  name:     string
  slug?:    string
  lpUrl?:   string
  fileUrl?: string
  agentId?: string | null  // owning agent; null/'' = "Toda la agencia"
  tenantId?: string  // required when caller is super_admin
}): Promise<CreateLeadMagnetResult | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre es obligatorio' }

  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenant_id = ctx.tenant_id ?? fields.tenantId ?? null
  if (!tenant_id) return { ok: false, error: 'Tenant requerido para super_admin' }

  const supabase  = createAdminClient()

  const agent = await resolveChannelAgentId(supabase, tenant_id, fields.agentId)
  if (agent && typeof agent === 'object') return { ok: false, error: agent.error }

  const publicId  = genPublicId()
  const slug      = fields.slug?.trim() || slugify(fields.name)
  const channelId = crypto.randomUUID()
  const seqId     = crypto.randomUUID()

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('acquisition_channels')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('slug', slug)
    .limit(1)
    .single()

  if (existing) return { ok: false, error: `El slug "${slug}" ya está en uso. Elige otro.` }

  const { error: chErr } = await supabase.from('acquisition_channels').insert({
    id:           channelId,
    tenant_id,
    public_id:    publicId,
    channel_type: 'lead_magnet',
    name:         fields.name.trim(),
    slug,
    active:       true,
    agent_id:     agent,
    metadata:     {
      lp_url:   fields.lpUrl?.trim()   || null,
      file_url: fields.fileUrl?.trim() || null,
    },
  })

  if (chErr) return { ok: false, error: chErr.message }

  const { error: seqErr } = await supabase.from('email_sequences').insert({
    id:       seqId,
    tenant_id,
    name:     `Secuencia · ${fields.name.trim()}`,
    active:   true,
  })

  if (seqErr) return { ok: false, error: seqErr.message }

  // Link sequence to channel
  await supabase
    .from('acquisition_channels')
    .update({ email_sequence_id: seqId })
    .eq('id', channelId)

  await insertSourceNotification(supabase, tenant_id, 'lm_added', `Nuevo lead magnet: ${fields.name.trim()}`)

  revalidatePath('/sources')
  revalidatePath('/emails')
  revalidatePath('/analytics')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  const embedSnippet = `<script>
  (function(){
    var d = {v: localStorage.getItem('_itm_vid') || (function(){
      var id = crypto.randomUUID(); localStorage.setItem('_itm_vid', id); return id;
    })()};
    navigator.sendBeacon('${baseUrl}/api/intake/${publicId}/view', JSON.stringify(d));
  })();
</script>`

  return { ok: true, channelId, publicId, slug, sequenceId: seqId, embedSnippet }
}

// ─── Update channel (name + active) ──────────────────────────────────────────

export async function updateChannel(
  channelId: string,
  fields: { name: string; active: boolean; agentId?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre es obligatorio' }

  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  // agentId provided → validate it belongs to the channel's tenant. Resolve the
  // channel's tenant first (super_admin has no ctx.tenant_id).
  const update: Record<string, unknown> = { name: fields.name.trim(), active: fields.active }
  if (fields.agentId !== undefined) {
    let chQ = supabase.from('acquisition_channels').select('tenant_id').eq('id', channelId)
    if (ctx.tenant_id) chQ = chQ.eq('tenant_id', ctx.tenant_id)
    const { data: chRow } = await chQ.maybeSingle()
    if (!chRow) return { ok: false, error: 'Fuente no encontrada' }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent = await resolveChannelAgentId(supabase, (chRow as any).tenant_id, fields.agentId)
    if (agent && typeof agent === 'object') return { ok: false, error: agent.error }
    update.agent_id = agent
  }

  let q = supabase
    .from('acquisition_channels')
    .update(update)
    .eq('id', channelId)
  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)

  const { error } = await q
  if (error) return { ok: false, error: error.message }

  revalidatePath('/sources')
  revalidatePath('/emails')
  revalidatePath('/analytics')
  return { ok: true }
}

// ─── Archive channel (soft-delete) ────────────────────────────────────────────

export async function archiveChannel(
  channelId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  // Archiving is silent — no notification. Notifications fire only on creation
  // and on permanent deletion (see deleteChannelPermanently).
  let q = supabase
    .from('acquisition_channels')
    .update({ active: false, archived_at: new Date().toISOString() })
    .eq('id', channelId)
  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)

  const { error } = await q
  if (error) return { ok: false, error: error.message }

  revalidatePath('/sources')
  revalidatePath('/emails')
  revalidatePath('/analytics')
  return { ok: true }
}

// ─── Permanently delete an archived channel (orphans its leads) ──────────────

export async function deleteChannelPermanently(
  channelId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  // Fetch channel (tenant-scoped for agent_owner) — capture name/type BEFORE
  // deleting, since the notification must be self-contained.
  let chQ = supabase
    .from('acquisition_channels')
    .select('id, name, channel_type, tenant_id, archived_at')
    .eq('id', channelId)
  if (ctx.tenant_id) chQ = chQ.eq('tenant_id', ctx.tenant_id)
  const { data: ch } = await chQ.maybeSingle()
  if (!ch) return { ok: false, error: 'Fuente no encontrada' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = ch as any
  // Guard: only archived channels may be permanently deleted.
  if (!c.archived_at) {
    return { ok: false, error: 'Primero archiva la fuente antes de eliminarla permanentemente.' }
  }

  // a) Orphan the leads — they stay, they just lose channel attribution.
  //    (The FK is ON DELETE SET NULL too; this is explicit for clarity.)
  const { error: orphanErr } = await supabase
    .from('leads')
    .update({ acquisition_channel_id: null })
    .eq('acquisition_channel_id', channelId)
  if (orphanErr) return { ok: false, error: orphanErr.message }

  // b) Delete page-view rows (the FK cascades too; explicit for clarity).
  await supabase.from('channel_page_views').delete().eq('channel_id', channelId)

  // c) No other child tables reference the channel — lead_events,
  //    lead_sequence_runs and email_sends reference lead_id and stay with the
  //    now-orphaned leads (their active sequences keep running).

  // d) Notify (only for the surfaced source types) BEFORE deleting the row.
  if (c.channel_type === 'event') {
    await insertSourceNotification(supabase, c.tenant_id, 'event_deleted', `Evento eliminado permanentemente: ${c.name}`)
  } else if (c.channel_type === 'lead_magnet') {
    await insertSourceNotification(supabase, c.tenant_id, 'lm_deleted', `Lead magnet eliminado permanentemente: ${c.name}`)
  }

  // e) Delete the channel row.
  const { error: delErr } = await supabase.from('acquisition_channels').delete().eq('id', channelId)
  if (delErr) return { ok: false, error: delErr.message }

  revalidatePath('/sources')
  revalidatePath('/emails')
  revalidatePath('/analytics')
  return { ok: true }
}

// ─── Update channel sequence association ─────────────────────────────────────

export async function updateChannelSequence(
  channelId: string,
  emailSequenceId: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()
  let q = supabase
    .from('acquisition_channels')
    .update({ email_sequence_id: emailSequenceId })
    .eq('id', channelId)
  if (ctx.tenant_id) q = q.eq('tenant_id', ctx.tenant_id)

  const { error } = await q
  if (error) return { ok: false, error: error.message }

  revalidatePath('/sources')
  revalidatePath('/emails')
  return { ok: true }
}

// ─── Create Event channel ─────────────────────────────────────────────────────

export interface CreateEventResult {
  ok: true
  channelId: string
  publicId: string
  slug: string
  formSnippet: string
}

export async function createEvent(fields: {
  name:       string
  slug?:      string
  eventDate?: string
  location?:  string
  agentId?:   string | null  // owning agent; null/'' = "Toda la agencia"
  tenantId?:  string  // required when caller is super_admin
}): Promise<CreateEventResult | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre es obligatorio' }
  if (!fields.eventDate?.trim()) return { ok: false, error: 'La fecha del evento es obligatoria' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields.eventDate.trim())) return { ok: false, error: 'Fecha del evento inválida' }

  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenant_id = ctx.tenant_id ?? fields.tenantId ?? null
  if (!tenant_id) return { ok: false, error: 'Tenant requerido para super_admin' }

  const supabase  = createAdminClient()

  const agent = await resolveChannelAgentId(supabase, tenant_id, fields.agentId)
  if (agent && typeof agent === 'object') return { ok: false, error: agent.error }

  const publicId  = genPublicId()
  const slug      = fields.slug?.trim() || slugify(fields.name)
  const channelId = crypto.randomUUID()

  const { data: existing } = await supabase
    .from('acquisition_channels')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('slug', slug)
    .limit(1)
    .single()

  if (existing) return { ok: false, error: `El slug "${slug}" ya está en uso. Elige otro.` }

  const { error: chErr } = await supabase.from('acquisition_channels').insert({
    id:           channelId,
    tenant_id,
    public_id:    publicId,
    channel_type: 'event',
    name:         fields.name.trim(),
    slug,
    active:       true,
    agent_id:     agent,
    metadata:     {
      event_date: fields.eventDate?.trim() || null,
      location:   fields.location?.trim()  || null,
    },
  })

  if (chErr) return { ok: false, error: chErr.message }

  await insertSourceNotification(supabase, tenant_id, 'event_added', `Nuevo evento: ${fields.name.trim()}`)

  revalidatePath('/sources')
  revalidatePath('/analytics')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  const formSnippet = `<form action="${baseUrl}/api/intake/${publicId}/submit" method="POST">
  <input type="hidden" name="traffic_source" value="direct">
  <input type="text"   name="first_name"    placeholder="Nombre"   required>
  <input type="text"   name="last_name"     placeholder="Apellido">
  <input type="email"  name="email"         placeholder="Email"    required>
  <input type="tel"    name="phone"         placeholder="Teléfono">
  <!-- Honeypot (invisible, must be empty) -->
  <input type="text" name="_hp" style="display:none" tabindex="-1" autocomplete="off">
  <button type="submit">Registrarme al evento</button>
</form>`

  return { ok: true, channelId, publicId, slug, formSnippet }
}

// ─── Create Contact Form (Web) channel ────────────────────────────────────────
// Webflow-agnostic. Creates a contact_form channel with its own public_id. The
// channel's submission pipeline (form_submissions, contact_us notification,
// contact_us_question scoring) is identical to the existing Contact Us channel.
// Connect it via the native Webflow webhook (HMAC) OR the x-contact-secret backup
// endpoint OR a custom form posting to the public intake endpoint.

export interface CreateContactFormResult {
  ok: true
  channelId: string
  publicId:  string
  slug:      string
  webflowWebhookUrl: string
  contactBackupUrl:  string
  publicIntakeUrl:   string
  hasChannelSecret:  boolean
}

export async function createContactForm(fields: {
  name:          string
  slug?:         string
  agentId?:      string | null   // owning agent; null/'' = "Toda la agencia"
  webflowSecret?: string         // optional per-channel Webflow webhook secret
  tenantId?:     string          // required when caller is super_admin
}): Promise<CreateContactFormResult | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre es obligatorio' }

  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id && ctx.role !== 'super_admin') return { ok: false, error: 'Acceso no autorizado' }
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenant_id = ctx.tenant_id ?? fields.tenantId ?? null
  if (!tenant_id) return { ok: false, error: 'Tenant requerido para super_admin' }

  const supabase = createAdminClient()

  const agent = await resolveChannelAgentId(supabase, tenant_id, fields.agentId)
  if (agent && typeof agent === 'object') return { ok: false, error: agent.error }

  const publicId  = genPublicId()
  const slug      = fields.slug?.trim() || slugify(fields.name)
  const channelId = crypto.randomUUID()
  const secret    = fields.webflowSecret?.trim() || null

  const { data: existing } = await supabase
    .from('acquisition_channels')
    .select('id')
    .eq('tenant_id', tenant_id)
    .eq('slug', slug)
    .limit(1)
    .single()

  if (existing) return { ok: false, error: `El slug "${slug}" ya está en uso. Elige otro.` }

  const { error: chErr } = await supabase.from('acquisition_channels').insert({
    id:           channelId,
    tenant_id,
    public_id:    publicId,
    channel_type: 'contact_form',
    name:         fields.name.trim(),
    slug,
    active:       true,
    agent_id:     agent,
    metadata:     secret ? { webflow_secret: secret } : {},
  })

  if (chErr) return { ok: false, error: chErr.message }

  revalidatePath('/sources')
  revalidatePath('/analytics')

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  return {
    ok: true, channelId, publicId, slug,
    webflowWebhookUrl: `${baseUrl}/api/webhooks/webflow/${publicId}`,
    contactBackupUrl:  `${baseUrl}/api/contact/${publicId}/submit`,
    publicIntakeUrl:   `${baseUrl}/api/intake/${publicId}/submit`,
    hasChannelSecret:  !!secret,
  }
}
