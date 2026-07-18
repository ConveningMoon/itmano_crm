'use server'

import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { handleContactSubmission } from '@/lib/services/handle-contact-submission'
import { parseHostedPage } from '@/lib/hosted-page'

// Envío del formulario de contacto alojado. Público (la página no requiere
// sesión) — el canal se resuelve de nuevo en el servidor (nunca se confía en
// el cliente) y solo procede si su hosted_page está habilitada. Reusa la misma
// lógica que el webhook de Webflow (dedup por email, evento de scoring
// contact_us_question, notificación contact_us).

const HostedContactSchema = z.object({
  tenantSlug:  z.string().trim().min(1).max(80),
  channelSlug: z.string().trim().min(1).max(120),
  first_name:  z.string().trim().min(1, 'El nombre es obligatorio.').max(100),
  last_name:   z.string().trim().max(100).optional().default(''),
  email:       z.string().trim().email('Email inválido.').max(200),
  phone:       z.string().trim().max(30).optional().default(''),
  message:     z.string().trim().max(2000).optional().default(''),
  language:    z.enum(['es', 'en', 'pt']).default('es'),
  website:     z.string().max(0).optional().or(z.literal('')), // honeypot
})

export type HostedContactInput = z.input<typeof HostedContactSchema>

export async function submitHostedContact(
  input: HostedContactInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = HostedContactSchema.safeParse(input)
  if (!parsed.success) {
    if (parsed.error.issues.some(i => i.path[0] === 'website')) return { ok: true }
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los campos.' }
  }
  if (parsed.data.website) return { ok: true }

  const db = createAdminClient()

  const { data: tenant } = await db
    .from('tenants')
    .select('id')
    .eq('slug', parsed.data.tenantSlug)
    .maybeSingle()
  if (!tenant) return { ok: false, error: 'Página no disponible.' }

  const { data: channel } = await db
    .from('acquisition_channels')
    .select('id, tenant_id, name, agent_id, channel_type, active, hosted_page')
    .eq('tenant_id', (tenant as { id: string }).id)
    .eq('slug', parsed.data.channelSlug)
    .eq('active', true)
    .is('archived_at', null)
    .maybeSingle()

  const c = channel as {
    id: string; tenant_id: string; name: string; agent_id: string | null
    channel_type: string; active: boolean; hosted_page: unknown
  } | null
  if (!c || c.channel_type !== 'contact_form') return { ok: false, error: 'Página no disponible.' }
  if (!parseHostedPage(c.hosted_page)?.enabled) return { ok: false, error: 'Página no disponible.' }

  try {
    await handleContactSubmission({
      db,
      channel:    { id: c.id, tenant_id: c.tenant_id, name: c.name, agent_id: c.agent_id },
      first_name: parsed.data.first_name,
      last_name:  parsed.data.last_name,
      email:      parsed.data.email,
      phone:      parsed.data.phone || undefined,
      message:    parsed.data.message || undefined,
      language:   parsed.data.language,
    })
  } catch (err) {
    console.error(JSON.stringify({ service: 'hosted-contact', channel_id: c.id, error: String(err) }))
    return { ok: false, error: 'No pudimos enviar el formulario. Inténtalo de nuevo.' }
  }

  return { ok: true }
}
