import 'server-only'
import type { EmailContent } from '@/lib/email-content'

// Compilador único de contenido CRM → HTML de email. Lo usan los tres send
// paths (secuencia, compra, one-off) Y la vista previa del composer — nunca
// dupliques esta lógica en otro lado.
//
// Seguridad: todo texto de usuario y todo valor de merge se escapa ANTES de
// interpolar. Los merge tags se resuelven aquí (doble llave); un tag
// desconocido queda literal para que el autor lo vea en el correo de prueba.
// La URL del CTA no participa de la interpolación: se valida http(s) en el
// schema y aquí solo se escapa como atributo.

export interface MergeVars {
  customer_name:    string
  agent_name:       string
  agent_email:      string
  lead_magnet_name: string
  [key: string]:    string
}

export interface EmailBranding {
  tenantName:   string
  primaryColor: string // #RRGGBB — se valida; fallback al navy por defecto
}

export interface EmailSignature {
  agentName:  string
  agentEmail: string
}

export type EmailLocale = 'es' | 'en' | 'pt'

const UNSUBSCRIBE_LABEL: Record<EmailLocale, string> = {
  es: 'Cancelar suscripción',
  en: 'Unsubscribe',
  pt: 'Cancelar inscrição',
}

const FALLBACK_PRIMARY = '#1E3A5F'
const HEX_RE = /^#[0-9a-fA-F]{6}$/

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Reemplaza {{tag}} por el valor correspondiente. `escaped` controla si los
// valores se escapan (true para HTML del cuerpo, false para el asunto en
// texto plano). Tags desconocidos quedan tal cual.
function resolveMergeTags(text: string, vars: MergeVars, escaped: boolean): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key]
    if (value === undefined) return match
    return escaped ? escapeHtml(value) : value
  })
}

const FONT = "font-family:Arial,Helvetica,sans-serif"

export function renderEmail(params: {
  subject:        string
  content:        EmailContent
  vars:           MergeVars
  branding:       EmailBranding
  signature:      EmailSignature | null
  unsubscribeUrl: string
  locale?:        EmailLocale
}): { subject: string; html: string } {
  const { content, vars, branding, unsubscribeUrl } = params
  const locale  = params.locale ?? 'es'
  const primary = HEX_RE.test(branding.primaryColor) ? branding.primaryColor : FALLBACK_PRIMARY

  // Asunto: texto plano — merge sin escape HTML.
  const subject = resolveMergeTags(params.subject, vars, false)

  // Párrafos: escape → merge (valores escapados) → saltos de línea a <br/>.
  const paragraphsHtml = content.paragraphs
    .map(p => {
      const body = resolveMergeTags(escapeHtml(p), vars, true).replace(/\r?\n/g, '<br/>')
      return `<p style="margin:0 0 16px;${FONT};font-size:15px;line-height:1.6;color:#222222;">${body}</p>`
    })
    .join('\n')

  const ctaHtml = content.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;">
        <tr><td style="border-radius:6px;background-color:${primary};">
          <a href="${escapeHtml(content.cta.url)}" target="_blank"
             style="display:inline-block;padding:12px 28px;${FONT};font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">
            ${resolveMergeTags(escapeHtml(content.cta.label), vars, true)}
          </a>
        </td></tr>
      </table>`
    : ''

  const signatureHtml = content.include_signature && params.signature
    ? `<p style="margin:20px 0 0;${FONT};font-size:14px;line-height:1.5;color:#222222;">
        ${escapeHtml(params.signature.agentName)}<br/>
        <a href="mailto:${escapeHtml(params.signature.agentEmail)}" style="color:${primary};text-decoration:none;">
          ${escapeHtml(params.signature.agentEmail)}
        </a>
      </p>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f2f0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f2f2f0;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0"
             style="max-width:560px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
        <tr><td style="height:4px;background-color:${primary};font-size:0;line-height:0;">&nbsp;</td></tr>
        <tr><td style="padding:26px 32px 6px;${FONT};font-size:12px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:#8a8a86;">
          ${escapeHtml(branding.tenantName)}
        </td></tr>
        <tr><td style="padding:14px 32px 4px;">
${paragraphsHtml}
${ctaHtml}
${signatureHtml}
        </td></tr>
        <tr><td style="padding:20px 32px 26px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="border-top:1px solid #ececea;padding-top:14px;${FONT};font-size:12px;line-height:1.5;color:#9a9a96;">
              ${escapeHtml(branding.tenantName)} ·
              <a href="${escapeHtml(unsubscribeUrl)}" style="color:#9a9a96;">${UNSUBSCRIBE_LABEL[locale]}</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}
