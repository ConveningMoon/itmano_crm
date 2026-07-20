'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess, resolveTargetTenant } from '@/lib/auth/guards'
import { findAuthUserByEmail, normalizeEmail } from '@/lib/auth/admin-users'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import { PLANS } from '@/lib/plans'

const LANGUAGE_ENUM = SUPPORTED_LANGUAGE_CODES as [string, ...string[]]

// ─── Update tenant name ───────────────────────────────────────────────────────

export async function updateTenantName(
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!name.trim()) return { ok: false, error: 'El nombre no puede estar vacío' }

  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()
  // El tenant viene siempre del contexto (super_admin actuando como tenant
  // incluido). Sin selección no hay destino válido — error claro, sin fallback.
  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }
  const { error } = await supabase
    .from('tenants')
    .update({ name: name.trim() })
    .eq('id', tenantId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  return { ok: true }
}

// ─── Contexto para IA: descripción de agencia y de agente (064) ──────────────
// Texto libre que la IA consulta para el análisis de fit y para personalizar el
// contenido. Owner/super pueden editarlos (misma regla de escritura).

export async function updateTenantDescription(
  description: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }
  const value = description.trim().slice(0, 4000)

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('tenants')
    .update({ description: value || null })
    .eq('id', tenantId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  return { ok: true }
}

export async function updateAgentDescription(
  agentId: string,
  description: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }
  const value = description.trim().slice(0, 3000)

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('agents')
    .update({ description: value || null })
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  return { ok: true }
}

// ─── Update agent ─────────────────────────────────────────────────────────────

export async function updateAgent(
  agentId: string,
  fields: {
    name: string
    email: string
    phone: string
    accentColor: string
    avatarInitials: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!fields.name.trim()) return { ok: false, error: 'El nombre no puede estar vacío' }
  if (!fields.email.trim()) return { ok: false, error: 'El email no puede estar vacío' }

  const ctx = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()
  // El tenant viene siempre del contexto (super_admin actuando como tenant
  // incluido). Sin selección no hay destino válido — error claro, sin fallback.
  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }
  const { error } = await supabase
    .from('agents')
    .update({
      name:            fields.name.trim(),
      email:           fields.email.trim(),
      phone:           fields.phone.trim() || null,
      accent_color:    fields.accentColor,
      avatar_initials: fields.avatarInitials.trim().toUpperCase().slice(0, 2),
    })
    .eq('id', agentId)
    .eq('tenant_id', tenantId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── Update global scoring rules ──────────────────────────────────────────────
// Only super_admin (ITMANO internal) may edit the GLOBAL rules (tenant_id = null).
// Per-tenant overrides are a future feature. Only `points` and `is_active` are
// editable — the dimension/match_value vocabulary is fixed in code. The DB also
// enforces super_admin via the lead_score_rules write RLS policy; this guard gives
// a clean error and is the primary gate (an RLS-blocked UPDATE silently affects 0 rows).

const ScoreRuleUpdateSchema = z
  .array(
    z.object({
      id:       z.string().min(1),
      points:   z.number().int().min(-100).max(100),
      isActive: z.boolean(),
    })
  )
  .min(1)
  .max(200)

export async function updateScoreRules(
  updates: { id: string; points: number; isActive: boolean }[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  // super_admin edita las reglas GLOBALES (afectan a todos los tenants);
  // agent_owner edita OVERRIDES de SU tenant (nunca toca las globales ni otros
  // tenants). recompute_lead_score prefiere la regla del tenant (migración 029).
  if (ctx.role !== 'super_admin' && ctx.role !== 'agent_owner') {
    return { ok: false, error: 'No tienes permiso para ajustar el scoring.' }
  }

  const parsed = ScoreRuleUpdateSchema.safeParse(updates)
  if (!parsed.success) {
    return { ok: false, error: 'Los puntos deben ser números enteros entre -100 y 100.' }
  }

  const supabase = createAdminClient()

  if (ctx.role === 'super_admin') {
    for (const u of parsed.data) {
      const { error } = await supabase
        .from('lead_score_rules')
        .update({ points: u.points, is_active: u.isActive })
        .eq('id', u.id)
        .is('tenant_id', null) // global rules only — never touch a per-tenant override
      if (error) return { ok: false, error: error.message }
    }
    revalidatePath('/settings')
    return { ok: true }
  }

  // ── agent_owner → override por tenant ──────────────────────────────────────
  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant.' }

  // Identidad de cada regla editada (siempre por su id GLOBAL).
  const ids = parsed.data.map(u => u.id)
  const { data: globals } = await supabase
    .from('lead_score_rules')
    .select('id, category, dimension, match_value, event_type, decays, side_effect, label')
    .in('id', ids)
    .is('tenant_id', null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const byId = new Map<string, any>(((globals ?? []) as any[]).map(r => [r.id as string, r]))

  for (const u of parsed.data) {
    const g = byId.get(u.id)
    if (!g) continue // solo se pueden overridear reglas globales existentes

    // ¿Ya existe un override de este tenant para la misma regla?
    let q = supabase
      .from('lead_score_rules')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('category', g.category)
      .eq('dimension', g.dimension)
    q = g.match_value === null ? q.is('match_value', null) : q.eq('match_value', g.match_value)
    const { data: existing } = await q.maybeSingle()

    if (existing) {
      const { error } = await supabase
        .from('lead_score_rules')
        .update({ points: u.points, is_active: u.isActive })
        .eq('id', (existing as { id: string }).id)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('lead_score_rules').insert({
        tenant_id:   tenantId,
        category:    g.category,
        dimension:   g.dimension,
        match_value: g.match_value,
        event_type:  g.event_type,
        points:      u.points,
        decays:      g.decays,
        is_active:   u.isActive,
        side_effect: g.side_effect,
        label:       g.label,
      })
      if (error) return { ok: false, error: error.message }
    }
  }

  revalidatePath('/settings')
  return { ok: true }
}

// ─── Tenant logo (bucket tenant-assets) ───────────────────────────────────────
// El logo del tenant vive en el bucket público `tenant-assets` bajo
// `<tenant_id>/logo-<uuid>.<ext>` y su URL pública en tenants.logo_url (lo lee
// el sidebar). Escriben: super_admin (cualquier tenant — flujo de creación en
// /admin) y agent_owner (su propio tenant, vía resolveTargetTenant).

const LOGO_BUCKET     = 'tenant-assets'
const MAX_LOGO_BYTES  = 2 * 1024 * 1024 // 2 MB
const LOGO_EXT_BY_TYPE: Record<string, string> = {
  'image/png':     'png',
  'image/jpeg':    'jpg',
  'image/webp':    'webp',
  'image/svg+xml': 'svg',
}

// Extrae el path del objeto desde una URL pública del bucket de logos.
function logoPathFromPublicUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  const marker = `/${LOGO_BUCKET}/`
  const i = url.indexOf(marker)
  if (i === -1) return null
  const raw = url.slice(i + marker.length)
  try { return decodeURIComponent(raw) } catch { return raw }
}

// Borra el objeto anterior del bucket (best-effort — nunca falla la action).
async function removeOldLogoObject(
  supabase: ReturnType<typeof createAdminClient>,
  oldUrl: string | null,
): Promise<void> {
  const path = logoPathFromPublicUrl(oldUrl)
  if (!path) return
  const { error } = await supabase.storage.from(LOGO_BUCKET).remove([path])
  if (error) {
    console.error(JSON.stringify({ service: 'tenant-logo-cleanup', path, error: error.message }))
  }
}

export async function updateTenantLogo(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  // super_admin puede nombrar el tenant destino (creación desde /admin);
  // agent_owner siempre opera sobre su propio tenant.
  const requested = formData.get('tenantId')
  const target = resolveTargetTenant(ctx, typeof requested === 'string' && requested ? requested : undefined)
  if (typeof target === 'object') return { ok: false, error: target.error }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'Archivo no válido' }
  if (!LOGO_EXT_BY_TYPE[file.type]) {
    return { ok: false, error: 'El logo debe ser PNG, JPG, WebP o SVG.' }
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: 'El logo supera el tamaño máximo de 2 MB.' }
  }

  const supabase = createAdminClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, logo_url')
    .eq('id', target)
    .maybeSingle()
  if (!tenant) return { ok: false, error: 'El tenant no existe.' }

  const ext   = LOGO_EXT_BY_TYPE[file.type]
  const path  = `${target}/logo-${crypto.randomUUID()}.${ext}`
  const bytes = Buffer.from(await file.arrayBuffer())

  const { error: uploadErr } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)

  const { error: updateErr } = await supabase
    .from('tenants')
    .update({ logo_url: pub.publicUrl })
    .eq('id', target)
  if (updateErr) {
    // No dejar el archivo huérfano si la fila no se pudo actualizar.
    await supabase.storage.from(LOGO_BUCKET).remove([path])
    return { ok: false, error: updateErr.message }
  }

  await removeOldLogoObject(supabase, (tenant as { logo_url: string | null }).logo_url)

  // El sidebar lee el logo en el layout — revalidar todo el árbol protegido.
  revalidatePath('/', 'layout')
  return { ok: true, url: pub.publicUrl }
}

export async function removeTenantLogo(
  tenantId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const target = resolveTargetTenant(ctx, tenantId)
  if (typeof target === 'object') return { ok: false, error: target.error }

  const supabase = createAdminClient()
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, logo_url')
    .eq('id', target)
    .maybeSingle()
  if (!tenant) return { ok: false, error: 'El tenant no existe.' }

  const { error } = await supabase
    .from('tenants')
    .update({ logo_url: null })
    .eq('id', target)
  if (error) return { ok: false, error: error.message }

  await removeOldLogoObject(supabase, (tenant as { logo_url: string | null }).logo_url)

  revalidatePath('/', 'layout')
  return { ok: true }
}

// ─── Suscripción (sales-led, pre-billing) ─────────────────────────────────────
// El owner no cambia su plan directamente (no hay procesador de pagos aún):
// SOLICITA el cambio/cancelación, la fila queda marcada y se notifica a ITMANO
// (bell del hub + Telegram vía subscription_request). El super_admin aplica el
// cambio desde el Centro de control.

const PLAN_VALUES = ['esencial', 'growth', 'partner'] as const
const PLAN_LABELS: Record<string, string> = { esencial: 'Esencial', growth: 'Growth', partner: 'Partner' }

async function notifySubscriptionRequest(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  message: string,
): Promise<void> {
  // Best-effort: la solicitud ya quedó registrada en subscriptions aunque la
  // notificación falle.
  const { error } = await supabase.from('notifications').insert({
    tenant_id: tenantId,
    type:      'subscription_request',
    message,
    read:      false,
    agent_id:  null,
  })
  if (error) {
    console.error(JSON.stringify({ service: 'subscription-request-notify', tenant_id: tenantId, error: error.message }))
  }
}

export async function requestSubscriptionChange(
  newPlan: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }
  if (!PLAN_VALUES.includes(newPlan as typeof PLAN_VALUES[number])) {
    return { ok: false, error: 'Plan inválido.' }
  }

  const supabase = createAdminClient()
  const { data: sub } = await supabase
    .from('subscriptions').select('plan, status').eq('tenant_id', tenantId).maybeSingle()
  if (!sub) return { ok: false, error: 'Este equipo no tiene una suscripción registrada. Contacta a ITMANO.' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((sub as any).plan === newPlan) return { ok: false, error: 'Ese ya es tu plan actual.' }

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'change_requested', requested_plan: newPlan, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }

  const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await notifySubscriptionRequest(supabase, tenantId, `${((tenant as any)?.name as string) ?? tenantId} solicitó cambiar su plan a ${PLAN_LABELS[newPlan]}.`)

  revalidatePath('/settings')
  revalidatePath('/admin')
  return { ok: true }
}

export async function requestSubscriptionCancel(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const supabase = createAdminClient()
  const { data: sub } = await supabase
    .from('subscriptions').select('status').eq('tenant_id', tenantId).maybeSingle()
  if (!sub) return { ok: false, error: 'Este equipo no tiene una suscripción registrada. Contacta a ITMANO.' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((sub as any).status === 'cancelled') return { ok: false, error: 'La suscripción ya está cancelada.' }

  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'cancel_requested', requested_plan: null, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }

  const { data: tenant } = await supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await notifySubscriptionRequest(supabase, tenantId, `${((tenant as any)?.name as string) ?? tenantId} solicitó cancelar su suscripción.`)

  revalidatePath('/settings')
  revalidatePath('/admin')
  return { ok: true }
}

// El owner se arrepiente antes de que ITMANO procese la solicitud.
export async function withdrawSubscriptionRequest(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('subscriptions')
    .update({ status: 'active', requested_plan: null, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .in('status', ['change_requested', 'cancel_requested'])
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  revalidatePath('/admin')
  return { ok: true }
}

// ─── Idiomas registrados por agente ───────────────────────────────────────────
// Definen los emails de cierre del agente (3 hitos × idioma, migración 058).
// Permisos: owner/super_admin editan cualquier agente de su tenant; el rol
// 'agent' SOLO los suyos (ctx.agent_id). El idioma principal (ruteo) no puede
// desmarcarse. Al agregar un idioma se provisionan al instante sus 3 correos
// vacíos (ensurePurchaseTemplateRows) para que aparezcan en /emails.

export async function updateAgentLanguages(
  agentId: string,
  languages: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()

  const isSelf = ctx.role === 'agent' && ctx.agent_id === agentId
  if (ctx.role === 'agent' && !isSelf) {
    return { ok: false, error: 'Solo puedes editar tus propios idiomas.' }
  }

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const clean = [...new Set(languages)].filter(l => (SUPPORTED_LANGUAGE_CODES as string[]).includes(l))
  if (clean.length === 0) return { ok: false, error: 'El agente debe atender al menos un idioma.' }

  const supabase = createAdminClient()
  const { data: agent } = await supabase
    .from('agents')
    .select('id, language')
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  if (!agent) return { ok: false, error: 'Agente no encontrado' }

  const primary = (agent as { language: string }).language
  if (!clean.includes(primary)) {
    return { ok: false, error: 'El idioma principal del agente no puede quitarse.' }
  }

  const { error } = await supabase
    .from('agents')
    .update({ languages: clean })
    .eq('id', agentId)
    .eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }

  // Provisiona las filas de emails de cierre del/los idiomas nuevos.
  const { ensurePurchaseTemplateRows } = await import('@/lib/services/closing-emails-status')
  await ensurePurchaseTemplateRows(supabase, tenantId)

  revalidatePath('/settings')
  revalidatePath('/emails')
  return { ok: true }
}

// ─── Firma de correo por agente ───────────────────────────────────────────────
// Se muestra al final de todos los correos (secuencias, compra, one-off) del
// agente asignado al lead. Texto libre multilínea; vacío = sin firma.

export async function updateAgentSignature(
  agentId: string,
  signature: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const trimmed = signature.trim()
  if (trimmed.length > 600) return { ok: false, error: 'La firma es demasiado larga (máx. 600 caracteres).' }

  const supabase = createAdminClient()
  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const { error } = await supabase
    .from('agents')
    .update({ email_signature: trimmed || null })
    .eq('id', agentId)
    .eq('tenant_id', tenantId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  return { ok: true }
}

// ─── Agents: create + login access (invite / revoke) ──────────────────────────
// All three are owner/super_admin only; requireWriteAccess blocks role 'agent'
// (read-only). Login access uses the same PRE-PROVISION pattern as provisionOwner:
// the auth user + user_profiles(role='agent') + agents.user_id are created up front
// so the agent's first Magic Link just works. Email is NOT sent here (the verified
// sending domain is per-tenant, not ITMANO's) — the UI shows a copyable message.

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

// 'agent-' + slug(name), with a numeric suffix on collision within the tenant.
async function generateAgentId(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  name: string,
): Promise<string> {
  const base = `agent-${slugify(name) || 'team'}`
  const { data } = await supabase
    .from('agents')
    .select('id')
    .eq('tenant_id', tenantId)
    .like('id', `${base}%`)
  const taken = new Set((data ?? []).map(r => (r as { id: string }).id))
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}

const CreateAgentSchema = z.object({
  name:           z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  email:          z.string().trim().email('Email inválido'),
  phone:          z.string().trim().max(40).optional(),
  language:       z.enum(LANGUAGE_ENUM),
  avatarInitials: z.string().trim().min(1).max(2),
  accentColor:    z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color inválido (formato #RRGGBB)'),
  tenantId:       z.string().optional(), // required for super_admin
})

export async function createAgent(
  input: {
    name: string; email: string; phone?: string; language: string
    avatarInitials: string; accentColor: string; tenantId?: string
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const parsed = CreateAgentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }
  }

  const tenant = resolveTargetTenant(ctx, parsed.data.tenantId)
  if (typeof tenant === 'object') return { ok: false, error: tenant.error }
  const tenantId = tenant

  const supabase = createAdminClient()

  // Planes de un solo agente (Esencial/Growth): no se pueden crear más agentes.
  // super_admin (opera cualquier tenant) siempre puede. Defensa server-side del
  // gate de UI (#9).
  if (ctx.role !== 'super_admin') {
    const { data: sub } = await supabase.from('subscriptions').select('plan').eq('tenant_id', tenantId).maybeSingle()
    const plan = ((sub as { plan?: string } | null)?.plan ?? 'esencial') as 'esencial' | 'growth' | 'partner'
    if (!PLANS[plan].features.multiLogin) {
      return { ok: false, error: 'Tu plan incluye un solo agente. Adquiere el plan Partner para agregar más.' }
    }
  }

  const id       = await generateAgentId(supabase, tenantId, parsed.data.name)

  const { error } = await supabase.from('agents').insert({
    id,
    tenant_id:       tenantId,
    name:            parsed.data.name,
    email:           normalizeEmail(parsed.data.email),
    phone:           parsed.data.phone?.trim() || null,
    language:        parsed.data.language,
    languages:       [parsed.data.language],
    avatar_initials: parsed.data.avatarInitials.toUpperCase().slice(0, 2),
    accent_color:    parsed.data.accentColor,
    active:          true,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true, id }
}

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Administrador ITMANO',
  agent_owner: 'Propietario',
  agent:       'Agente',
}

export async function inviteAgentAccess(
  agentId: string,
  email?: string,
): Promise<{ ok: true; email: string; created: boolean } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  // Load the agent tenant-scoped (super_admin: no tenant filter).
  let agentQ = supabase.from('agents').select('id, tenant_id, email, user_id').eq('id', agentId)
  if (ctx.tenant_id) agentQ = agentQ.eq('tenant_id', ctx.tenant_id)
  const { data: agent } = await agentQ.maybeSingle()
  if (!agent) return { ok: false, error: 'Agente no encontrado' }

  const a = agent as { id: string; tenant_id: string; email: string; user_id: string | null }
  if (a.user_id) return { ok: false, error: 'Este agente ya tiene acceso' }

  // Resolve + validate the email up front. Default to the agent's stored email.
  const rawEmail = (email?.trim() || a.email)
  const emailCheck = z.string().email().safeParse(rawEmail)
  if (!emailCheck.success) return { ok: false, error: 'Email inválido' }
  const normalized = normalizeEmail(rawEmail)

  // Validate EVERYTHING that can fail before creating any auth user, so a rejected
  // invite never leaves an orphan account behind.
  const found = await findAuthUserByEmail(normalized)
  if (found) {
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('tenant_id, role')
      .eq('id', found.id)
      .maybeSingle()
    if (existingProfile) {
      const p = existingProfile as { tenant_id: string | null; role: string }
      return { ok: false, error: `Este email ya tiene un perfil (${ROLE_LABELS[p.role] ?? p.role} en ${p.tenant_id ?? 'sin tenant'}).` }
    }
  }

  // Find-or-create the auth user (no password — Magic Link; email_confirm so the
  // first link works immediately).
  let userId: string
  let created = false
  if (found) {
    userId = found.id
  } else {
    const { data: createdUser, error: createErr } = await supabase.auth.admin.createUser({
      email:         normalized,
      email_confirm: true,
    })
    if (createErr || !createdUser?.user) {
      return { ok: false, error: `No se pudo crear el usuario: ${createErr?.message ?? 'desconocido'}` }
    }
    userId  = createdUser.user.id
    created = true
  }

  // Si el tenant todavía no tiene owner, este primer login se vuelve el
  // agent_owner automáticamente (el resto entran como 'agent').
  const { count: ownerCount } = await supabase
    .from('user_profiles')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', a.tenant_id)
    .eq('role', 'agent_owner')
  const roleForNew = (ownerCount ?? 0) === 0 ? 'agent_owner' : 'agent'

  // Profile → link agents.user_id → record the invitation.
  const { error: profileErr } = await supabase.from('user_profiles').insert({
    id:        userId,
    tenant_id: a.tenant_id,
    role:      roleForNew,
  })
  if (profileErr) return { ok: false, error: profileErr.message }

  const { error: linkErr } = await supabase.from('agents').update({ user_id: userId }).eq('id', a.id)
  if (linkErr) return { ok: false, error: linkErr.message }

  const { error: inviteErr } = await supabase.from('invitations').insert({
    tenant_id:  a.tenant_id,
    email:      normalized,
    role:       roleForNew,
    agent_id:   a.id,
    invited_by: ctx.user_id,
    status:     'pending',
    expires_at: null,
  })
  if (inviteErr) return { ok: false, error: inviteErr.message }

  revalidatePath('/settings')
  return { ok: true, email: normalized, created }
}

export async function revokeAgentAccess(
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  const supabase = createAdminClient()

  let agentQ = supabase.from('agents').select('id, tenant_id, user_id').eq('id', agentId)
  if (ctx.tenant_id) agentQ = agentQ.eq('tenant_id', ctx.tenant_id)
  const { data: agent } = await agentQ.maybeSingle()
  if (!agent) return { ok: false, error: 'Agente no encontrado' }

  const a = agent as { id: string; tenant_id: string; user_id: string | null }
  if (!a.user_id) return { ok: false, error: 'Este agente no tiene acceso' }

  // Deleting the auth user cascades: user_profiles ON DELETE CASCADE, and
  // agents.user_id ON DELETE SET NULL (031). The agent's leads are untouched.
  const { error: delErr } = await supabase.auth.admin.deleteUser(a.user_id)
  if (delErr) return { ok: false, error: `No se pudo revocar el acceso: ${delErr.message}` }

  // Mark the pending invitation for this agent as revoked.
  await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('agent_id', a.id)
    .eq('status', 'pending')

  revalidatePath('/settings')
  revalidatePath('/leads')
  return { ok: true }
}

// Links the agent_owner's own login to one of their tenant's agent records (so the
// owner is attributed as that agent — e.g. for lead import). Owner-only; the target
// agent must be in the owner's tenant and unlinked, and the owner must not already
// be linked to another agent. Does NOT create an auth user or invitation (the owner
// already has a login) and does NOT change the owner's role/permissions.
export async function linkAgentToMyAccount(
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'agent_owner' || !ctx.tenant_id) {
    return { ok: false, error: 'Solo el propietario puede vincularse a un agente' }
  }

  const supabase = createAdminClient()

  // The owner must not already be linked to an agent.
  const { data: alreadyLinked } = await supabase
    .from('agents').select('id').eq('user_id', ctx.user_id).maybeSingle()
  if (alreadyLinked) {
    return { ok: false, error: 'Ya estás vinculado a un agente' }
  }

  // Target agent: in the owner's tenant, currently unlinked.
  const { data: agent } = await supabase
    .from('agents').select('id, user_id').eq('id', agentId).eq('tenant_id', ctx.tenant_id).maybeSingle()
  if (!agent) return { ok: false, error: 'Agente no encontrado' }
  if ((agent as { user_id: string | null }).user_id) {
    return { ok: false, error: 'Ese agente ya tiene un acceso vinculado' }
  }

  // Guard against a race with the UNIQUE(user_id) constraint via the .is null filter.
  const { error } = await supabase
    .from('agents').update({ user_id: ctx.user_id }).eq('id', agentId).is('user_id', null)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/settings')
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── Transferir el rol de owner del tenant ────────────────────────────────────
// El owner actual (o super_admin) marca a otro agente CON login como nuevo
// agent_owner; el anterior pasa a 'agent'. Ambos deben estar vinculados a un
// registro de agente (invariante de tenant-context: rol 'agent' ⇒ agents.user_id).
export async function setAgentAsOwner(
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'agent_owner' && ctx.role !== 'super_admin') {
    return { ok: false, error: 'Solo el propietario o un administrador de ITMANO puede transferir el rol.' }
  }
  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const supabase = createAdminClient()

  const { data: target } = await supabase
    .from('agents').select('id, user_id').eq('id', agentId).eq('tenant_id', tenantId).maybeSingle()
  if (!target) return { ok: false, error: 'Agente no encontrado' }
  const t = target as { id: string; user_id: string | null }
  if (!t.user_id) return { ok: false, error: 'El agente necesita un acceso de login para ser propietario. Invítalo primero.' }

  // Owners actuales del tenant.
  const { data: owners } = await supabase
    .from('user_profiles').select('id').eq('tenant_id', tenantId).eq('role', 'agent_owner')
  const ownerIds = ((owners ?? []) as { id: string }[]).map(o => o.id)

  if (ownerIds.length === 1 && ownerIds[0] === t.user_id) {
    return { ok: false, error: 'Ese agente ya es el propietario.' }
  }

  // Cada owner actual (distinto del target) debe estar vinculado a un agente para
  // poder degradarlo a 'agent' sin romper su sesión.
  for (const oid of ownerIds) {
    if (oid === t.user_id) continue
    const { data: oa } = await supabase
      .from('agents').select('id').eq('user_id', oid).eq('tenant_id', tenantId).maybeSingle()
    if (!oa) {
      return { ok: false, error: 'El propietario actual no está vinculado a un agente; vincúlalo primero (botón "Vincular a mi cuenta") para transferir.' }
    }
  }

  // Promover el nuevo owner.
  const { error: upErr } = await supabase
    .from('user_profiles').update({ role: 'agent_owner' }).eq('id', t.user_id)
  if (upErr) return { ok: false, error: upErr.message }

  // Degradar a los owners anteriores.
  for (const oid of ownerIds) {
    if (oid === t.user_id) continue
    await supabase.from('user_profiles').update({ role: 'agent' }).eq('id', oid)
  }

  revalidatePath('/settings')
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}

// ─── Eliminar un agente reasignando su trabajo al owner (plan Partner) ─────────
// Destructivo pero sin pérdida: reasigna leads/fuentes/secuencias/propiedades del
// agente al agente-owner, borra su login y su registro. leads.agent_id es
// RESTRICT, así que la reasignación DEBE ocurrir antes del delete. Doble
// verificación en la UI. Gate: owner/super_admin + plan Partner (multiLogin).
export async function deleteAgent(
  agentId: string,
): Promise<{ ok: true; reassignedTo: string } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'agent_owner' && ctx.role !== 'super_admin') {
    return { ok: false, error: 'Solo el propietario o un administrador de ITMANO puede eliminar agentes.' }
  }
  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const supabase = createAdminClient()

  // Gate por plan: eliminar agentes es de Partner (multi-login). super_admin pasa.
  if (ctx.role !== 'super_admin') {
    const { data: sub } = await supabase
      .from('subscriptions').select('plan').eq('tenant_id', tenantId).maybeSingle()
    const plan = (sub as { plan?: string } | null)?.plan
    if (!plan || !PLANS[plan as keyof typeof PLANS]?.features.multiLogin) {
      return { ok: false, error: 'Eliminar agentes está disponible en el plan Partner.' }
    }
  }

  const { data: agent } = await supabase
    .from('agents').select('id, user_id, active').eq('id', agentId).eq('tenant_id', tenantId).maybeSingle()
  if (!agent) return { ok: false, error: 'Agente no encontrado' }
  const a = agent as { id: string; user_id: string | null; active: boolean }

  // No eliminar al propietario.
  if (a.user_id) {
    const { data: prof } = await supabase
      .from('user_profiles').select('role').eq('id', a.user_id).maybeSingle()
    if ((prof as { role?: string } | null)?.role === 'agent_owner') {
      return { ok: false, error: 'No puedes eliminar al propietario. Transfiere el rol a otro agente primero.' }
    }
  }

  // Agente-owner destino de la reasignación.
  const { data: ownerProfile } = await supabase
    .from('user_profiles').select('id').eq('tenant_id', tenantId).eq('role', 'agent_owner').maybeSingle()
  let targetAgentId: string | null = null
  if (ownerProfile) {
    const { data: oa } = await supabase
      .from('agents').select('id').eq('user_id', (ownerProfile as { id: string }).id).eq('tenant_id', tenantId).maybeSingle()
    targetAgentId = (oa as { id: string } | null)?.id ?? null
  }
  if (!targetAgentId) {
    // Fallback: primer otro agente activo del tenant.
    const { data: other } = await supabase
      .from('agents').select('id').eq('tenant_id', tenantId).eq('active', true).neq('id', agentId).order('id').limit(1)
    targetAgentId = ((other ?? []) as { id: string }[])[0]?.id ?? null
  }
  if (!targetAgentId) return { ok: false, error: 'No hay otro agente al que reasignar. No se puede eliminar el último agente.' }
  if (targetAgentId === agentId) return { ok: false, error: 'No puedes reasignar al mismo agente.' }

  // Reasignar todo lo del agente al destino (leads es RESTRICT → obligatorio).
  const reassign = async (table: string, column: string) => {
    const { error } = await supabase.from(table).update({ [column]: targetAgentId }).eq(column, agentId).eq('tenant_id', tenantId)
    if (error) throw new Error(`${table}: ${error.message}`)
  }
  try {
    await reassign('leads', 'agent_id')
    await reassign('acquisition_channels', 'agent_id')
    await reassign('email_sequences', 'agent_id')
    await reassign('notifications', 'agent_id')
    await reassign('properties', 'created_by_agent_id')
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo reasignar el trabajo del agente.' }
  }

  // Invitaciones del agente → eliminarlas (su FK es SET NULL, pero limpiamos).
  await supabase.from('invitations').delete().eq('agent_id', agentId)

  // Borrar el login (cascade user_profiles). Si no tiene, se omite.
  if (a.user_id) {
    const { error: delUserErr } = await supabase.auth.admin.deleteUser(a.user_id)
    if (delUserErr) return { ok: false, error: `No se pudo eliminar el login: ${delUserErr.message}` }
  }

  // Borrar el agente. purchase_email_templates: CASCADE (sus correos de cierre);
  // ai_usage_events: SET NULL (histórico anónimo).
  const { error: delAgentErr } = await supabase.from('agents').delete().eq('id', agentId).eq('tenant_id', tenantId)
  if (delAgentErr) return { ok: false, error: delAgentErr.message }

  revalidatePath('/settings')
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  revalidatePath('/properties')
  revalidatePath('/sources')
  return { ok: true, reassignedTo: targetAgentId }
}
