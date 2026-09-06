import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SubscriptionStatus } from '@/lib/subscriptions'
import { resendForAccount } from '@/lib/resend'
import { resolveSenderIdentity } from '@/lib/services/sender-identity'

// Dos destinatarios en una sola transición:
//   · ITMANO — bell + Telegram vía notifications. Modelo sales-led: alguien
//     debería llamar antes de que la cuenta se pudra. Un solo insert alcanza
//     para ambos canales: el super_admin lee TODAS las notificaciones (bypassa
//     el filtro de tenant, ver getNotifications(null) en data/notifications.ts)
//     y el fan-out a Telegram (api/notifications/dispatch) siempre incluye al
//     chat_id del agent_owner del tenant — el mismo mecanismo que ya usa el
//     aviso de retención de billing-lifecycle/route.ts.
//   · El cliente — un email que explica qué cambió y, sobre todo, QUÉ SE
//     CONSERVA. Baja soporte y baja el arrepentimiento.
// Best-effort: si la notificación falla, el cambio de estado ya quedó aplicado
// (persist.ts ya escribió `subscriptions` antes de llamar aquí).

const CLIENT_SUBJECT = 'Tu suscripción de ITMANO CRM está inactiva'

const CLIENT_BODY = `Tu suscripción quedó inactiva, así que pusimos en pausa la generación con IA y las secuencias automáticas.

Lo que conservas íntegro:
· Todos tus leads, su historial y su puntuación.
· La exportación completa de tus datos, sin límite.
· Tus secuencias escritas — no borramos ninguna.
· El contacto uno a uno con tus leads desde tu propio correo.

Puedes reactivar tu suscripción desde Configuración cuando quieras, y todo vuelve a su sitio.`

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Render mínimo del email al cliente. NO reutiliza renderEmail (services/email-render.ts):
// ese compilador exige un `unsubscribeUrl` firmado por `leadId` (unsubscribe-url.ts hace
// HMAC del leadId) y añade el pie de "cancelar suscripción" — el owner del tenant no es un
// lead y este aviso es transaccional sobre su propia facturación, no una campaña sujeta a
// baja. Se mantiene el mismo estilo visual (texto plano, sin logo, sin CTA) que el resto de
// los correos del CRM para que se lea como un mensaje personal, no publicitario.
function renderClientEmail(): string {
  const paragraphs = CLIENT_BODY
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const html = escapeHtml(block).replace(/\r?\n/g, '<br/>')
      return `<p style="margin:0 0 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">${html}</p>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(CLIENT_SUBJECT)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="max-width:600px;margin:0 auto;padding:28px 24px;">
${paragraphs}
  </div>
</body>
</html>`
}

export async function notifyDegradation(
  tenantId: string,
  status: SubscriptionStatus,
): Promise<void> {
  const supabase = createAdminClient()

  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, slug')
    .eq('id', tenantId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sin tipos generados de Supabase, la fila llega untyped
  const t = tenant as any
  const name = (t?.name as string | undefined) ?? tenantId
  const slug = (t?.slug as string | undefined) ?? tenantId

  const label = status === 'paused' ? 'pausó' : 'canceló'
  const { error } = await supabase.from('notifications').insert({
    tenant_id: tenantId,
    type:      'subscription_request',
    message:   `${name} ${label} su suscripción. La cuenta pasó a modo degradado.`,
    read:      false,
    agent_id:  null,
  })
  if (error) {
    console.error(JSON.stringify({ service: 'degradation-notify', tenant_id: tenantId, error: error.message }))
  }

  // Email al cliente — best-effort e independiente del insert de arriba: un
  // fallo aquí no debe borrar el aviso a ITMANO que ya se intentó insertar.
  try {
    const { data: owner } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('role', 'agent_owner')
      .maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- sin tipos generados de Supabase, la fila llega untyped
    const ownerId = (owner as any)?.id as string | undefined
    if (!ownerId) {
      console.error(JSON.stringify({ service: 'degradation-notify', tenant_id: tenantId, error: 'no_owner_profile' }))
      return
    }

    // Resolución por id (no por email): mismo patrón que getTenantsWithOwners
    // en data/tenants.ts, el único otro lugar que resuelve el owner de un
    // tenant contra auth.users.
    const { data: authUser } = await supabase.auth.admin.getUserById(ownerId)
    const ownerEmail = authUser?.user?.email ?? null
    if (!ownerEmail) {
      console.error(JSON.stringify({ service: 'degradation-notify', tenant_id: tenantId, error: 'no_owner_email' }))
      return
    }

    // customDomainAllowed: false fuerza el dominio compartido de ITMANO y la
    // cuenta 'itmano' de Resend — el dominio propio del tenant ya está
    // revocado en este punto (o en camino a estarlo vía billing-lifecycle),
    // y un tenant legacy 'aj' no tiene verificado el dominio compartido en su
    // propia cuenta de Resend.
    const identity = resolveSenderIdentity(
      { name, slug, email_from_address: null, resend_account: null, domain_status: null },
      { customDomainAllowed: false },
    )
    if (!identity) {
      console.error(JSON.stringify({ service: 'degradation-notify', tenant_id: tenantId, error: 'no_sender_identity' }))
      return
    }

    const { error: sendError } = await resendForAccount(identity.account).emails.send({
      from:    identity.from,
      to:      ownerEmail,
      subject: CLIENT_SUBJECT,
      html:    renderClientEmail(),
    })
    if (sendError) {
      console.error(JSON.stringify({ service: 'degradation-notify', tenant_id: tenantId, error: sendError.message }))
    }
  } catch (err) {
    console.error(JSON.stringify({
      service: 'degradation-notify', tenant_id: tenantId,
      error: err instanceof Error ? err.message : String(err),
    }))
  }
}
