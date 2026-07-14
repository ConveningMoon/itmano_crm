'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'

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
