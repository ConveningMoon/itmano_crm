import 'server-only'
import { resendForAccount } from '@/lib/resend'
import { columns } from '@/lib/supabase/columns'
import { resolveSenderIdentity } from '@/lib/services/sender-identity'
import type { createAdminClient } from '@/lib/supabase/admin'
import { trialNoticeDue, type TrialNoticeMoment } from '@/lib/subscriptions/trial-notice-due'

export { trialNoticeDue }
export type { TrialNoticeMoment }

type Db = ReturnType<typeof createAdminClient>

const NOTIFICATION_ID = columns('notifications', ['id'])
const TENANT_NAME = columns('tenants', ['name', 'slug'])
const OWNER_ID = columns('user_profiles', ['id'])

const COPY: Record<TrialNoticeMoment, { subject: string; lead: string; marker: string }> = {
  '3d': {
    subject: 'Tu prueba de ITMANO CRM termina en 3 días',
    lead:    'Tu prueba de ITMANO CRM termina en 3 días.',
    marker:  'Tu prueba termina en 3 días. Activa tu plan en Configuración.',
  },
  today: {
    subject: 'Tu prueba de ITMANO CRM terminó',
    lead:    'Tu prueba de ITMANO CRM terminó hoy.',
    marker:  'Tu prueba terminó. Activa tu plan en Configuración para seguir con todo.',
  },
}

function escapeHtml(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function body(moment: TrialNoticeMoment): string {
  return `${COPY[moment].lead}

Conservas todos tus leads, su historial y la exportación de tus datos. Sin un plan activo se pausan la IA y las secuencias automáticas, y la web pública queda con un número reducido de propiedades.

Para seguir con todo, activa tu plan desde Configuración.`
}

function renderHtml(moment: TrialNoticeMoment): string {
  const paragraphs = body(moment).split(/\n{2,}/).map(b =>
    `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">${escapeHtml(b.trim())}</p>`,
  ).join('\n')
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>${escapeHtml(COPY[moment].subject)}</title></head>
<body style="margin:0;padding:0;background-color:#ffffff;"><div style="max-width:600px;margin:0 auto;padding:28px 24px;">
${paragraphs}
</div></body></html>`
}

/**
 * Envía el aviso de fin de prueba al owner, una vez por momento y vencimiento.
 * Idempotencia: fila en `notifications` (type 'subscription_request') con un
 * mensaje marcador único por momento + fecha de vencimiento; se consulta antes
 * y se inserta después de enviar. El envío pasa por resendForAccount (y con él
 * por el send guard fuera de producción).
 */
export async function sendTrialNotice(
  db: Db,
  args: { tenantId: string; moment: TrialNoticeMoment; trialEndsAt: string },
): Promise<'sent' | 'skipped'> {
  const { tenantId, moment, trialEndsAt } = args
  const marker = `${COPY[moment].marker} (${trialEndsAt.slice(0, 10).split('-').reverse().join('/')})`

  const { data: existing, error: existingError } = await db
    .from('notifications')
    .select(NOTIFICATION_ID)
    .eq('tenant_id', tenantId)
    .eq('type', 'subscription_request')
    .eq('message', marker)
    .limit(1)
  if (existingError) throw existingError
  if (existing && existing.length > 0) return 'skipped'

  const { data: tenant } = await db.from('tenants').select(TENANT_NAME).eq('id', tenantId).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fila sin tipos generados
  const t = tenant as any
  const identity = resolveSenderIdentity(
    { name: t?.name ?? tenantId, slug: t?.slug ?? tenantId, email_from_address: null, resend_account: null, domain_status: null },
    { customDomainAllowed: false },
  )
  if (!identity) throw new Error('no_sender_identity')

  const { data: owner } = await db
    .from('user_profiles').select(OWNER_ID).eq('tenant_id', tenantId).eq('role', 'agent_owner')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ownerId = (owner as any)?.id as string | undefined
  if (!ownerId) throw new Error('no_owner_profile')
  const { data: authUser } = await db.auth.admin.getUserById(ownerId)
  const to = authUser?.user?.email ?? null
  if (!to) throw new Error('no_owner_email')

  const { error: sendError } = await resendForAccount(identity.account).emails.send({
    from: identity.from, to, subject: COPY[moment].subject, html: renderHtml(moment),
  })
  if (sendError) throw new Error(sendError.message)

  const { error: insertError } = await db.from('notifications').insert({
    tenant_id: tenantId, type: 'subscription_request', message: marker, read: false, agent_id: null,
  })
  if (insertError) throw insertError
  return 'sent'
}
