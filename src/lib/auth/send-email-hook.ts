// Correos de Supabase Auth enviados por el CRM (Send Email Hook, fase 3 del
// plan SaaS). PURO: arma los correos a partir del payload del hook; la ruta
// /api/auth/send-email verifica la firma, envía y registra.
//
// Por qué un hook y no el SMTP de Supabase: con SMTP los Magic Links salen de
// la cuenta de Resend de ITMANO sin que el CRM los vea, y su cuota se agota sin
// aviso. Con el hook, cada correo de acceso pasa por resendForAccount('itmano')
// y suma a la cuota medida (resend_usage_daily) y a auth_email_sends.
//
// Los enlaces van directo a /auth/callback con `token_hash`: el callback los
// verifica en el servidor con verifyOtp, sin depender del navegador que pidió
// el enlace (mismo flujo que tenía la plantilla de Supabase).
//
// Payload: https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook

export interface SendEmailHookPayload {
  user: {
    id:            string
    email:         string
    new_email?:    string | null
    user_metadata?: Record<string, unknown> | null
  }
  email_data: {
    token:             string
    token_hash:        string
    redirect_to:       string
    email_action_type: string
    site_url:          string
    token_new?:        string | null
    token_hash_new?:   string | null
    old_email?:        string | null
  }
}

export interface AuthEmail {
  to:      string
  subject: string
  html:    string
  text:    string
}

/** Tipos que el CRM sabe enviar. Los avisos (`*_notification`) Supabase sólo los manda si se activan. */
export const LINK_ACTIONS = ['magiclink', 'signup', 'invite', 'recovery', 'email_change', 'email'] as const

/** Tipo de verifyOtp que corresponde a cada acción del hook. */
export function otpTypeFor(action: string): 'email' | 'invite' | 'recovery' | 'email_change' | null {
  switch (action) {
    case 'magiclink':
    case 'signup':
    case 'email':        return 'email'
    case 'invite':       return 'invite'
    case 'recovery':     return 'recovery'
    case 'email_change': return 'email_change'
    default:             return null
  }
}

/**
 * Enlace al callback con el token. Supabase ya validó `redirect_to` contra la
 * lista de URLs permitidas; si apunta a /auth/callback (el login lo hace, con
 * su `next`) se le añade el token, y si no, se usa su origen con el destino
 * como `next`.
 */
export function authCallbackLink(redirectTo: string, siteUrl: string, tokenHash: string, otpType: string): string {
  let target: URL
  try {
    target = new URL(redirectTo || siteUrl)
  } catch {
    target = new URL(siteUrl)
  }
  let link: URL
  if (target.pathname === '/auth/callback') {
    link = target
  } else {
    link = new URL('/auth/callback', target.origin)
    const next = `${target.pathname}${target.search}`
    if (next !== '/' && /^\/[^/\\]/.test(next)) link.searchParams.set('next', next)
  }
  link.searchParams.set('token_hash', tokenHash)
  link.searchParams.set('type', otpType)
  return link.toString()
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface Copy {
  subject: string
  lead:    string
  button:  string
  note:    string
}

const COPY: Record<string, Copy> = {
  magiclink: {
    subject: 'Tu enlace de acceso a ITMANO',
    lead:    'Usa este botón para entrar al CRM. El enlace sirve una sola vez y vence en una hora.',
    button:  'Entrar a ITMANO',
    note:    'Si no pediste este acceso, ignora este correo: nadie entra sin el enlace.',
  },
  invite: {
    subject: 'Te invitaron a ITMANO',
    lead:    'Tu equipo te dio acceso al CRM. Usa este botón para entrar por primera vez.',
    button:  'Aceptar la invitación',
    note:    'Si no esperabas esta invitación, ignora este correo.',
  },
  recovery: {
    subject: 'Recupera el acceso a ITMANO',
    lead:    'Usa este botón para recuperar el acceso a tu cuenta. El enlace sirve una sola vez.',
    button:  'Recuperar el acceso',
    note:    'Si no lo pediste, ignora este correo: tu cuenta sigue igual.',
  },
  email_change_new: {
    subject: 'Confirma tu nuevo correo en ITMANO',
    lead:    'Confirma que esta dirección es la nueva de tu cuenta.',
    button:  'Confirmar este correo',
    note:    'Si no pediste el cambio, ignora este correo: no se aplicará.',
  },
  email_change_current: {
    subject: 'Confirma el cambio de correo de tu cuenta de ITMANO',
    lead:    'Alguien pidió cambiar el correo de tu cuenta. Confirma desde aquí si fuiste tú.',
    button:  'Confirmar el cambio',
    note:    'Si no fuiste tú, no hagas nada y avisa a quien administra tu equipo.',
  },
}
COPY.signup = COPY.magiclink
COPY.email = COPY.magiclink

// Sin el código de 6 dígitos: el login del CRM no tiene dónde escribirlo, y
// mostrarlo sólo confundiría.
function render(copy: Copy, link: string): Pick<AuthEmail, 'subject' | 'html' | 'text'> {
  const html = `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
<tr><td>
<p style="margin:0 0 8px;font-size:13px;letter-spacing:1px;color:#8a7440;font-weight:600">ITMANO</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${esc(copy.subject)}</h1>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5">${esc(copy.lead)}</p>
<a href="${esc(link)}" style="display:inline-block;background:#1a1a1a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600">${esc(copy.button)}</a>
<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#666">${esc(copy.note)}</p>
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#999;word-break:break-all">Si el botón no funciona, copia este enlace: ${esc(link)}</p>
</td></tr></table></td></tr></table></body></html>`
  const text = [copy.subject, '', copy.lead, '', link, '', copy.note].join('\n')
  return { subject: copy.subject, html, text }
}

/**
 * Los correos que pide el hook. `[]` si el tipo no se envía (avisos que no
 * están activados): la ruta responde 200 sin enviar y lo registra.
 *
 * email_change con "Secure email change" manda DOS correos. Ojo: Supabase
 * cruza los nombres por compatibilidad — la dirección ACTUAL usa
 * `token_hash_new`, y la NUEVA usa `token_hash`.
 */
export function buildAuthEmails(p: SendEmailHookPayload): AuthEmail[] {
  const action = p.email_data.email_action_type
  const otpType = otpTypeFor(action)
  if (!otpType) return []
  const { redirect_to, site_url } = p.email_data
  const link = (hash: string) => authCallbackLink(redirect_to, site_url, hash, otpType)

  if (action === 'email_change') {
    const newEmail = p.user.new_email ?? null
    const hashNew = p.email_data.token_hash_new || null
    if (newEmail && hashNew) {
      return [
        { to: p.user.email, ...render(COPY.email_change_current, link(hashNew)) },
        { to: newEmail,     ...render(COPY.email_change_new, link(p.email_data.token_hash)) },
      ]
    }
    // Un solo correo (secure change desactivado): a la dirección nueva.
    return [{ to: newEmail ?? p.user.email, ...render(COPY.email_change_new, link(p.email_data.token_hash)) }]
  }

  return [{ to: p.user.email, ...render(COPY[action] ?? COPY.magiclink, link(p.email_data.token_hash)) }]
}

/** "v1,whsec_…" (como lo da el panel de Supabase) → "whsec_…" (lo que espera svix). */
export function hookSecretForSvix(raw: string): string {
  return raw.trim().replace(/^v1,/, '')
}
