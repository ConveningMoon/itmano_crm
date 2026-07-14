import 'server-only'
import type { EmailContent } from '@/lib/email-content'

// Compilador único de contenido CRM → HTML de email. Lo usan los tres send
// paths (secuencia, compra, one-off) Y la vista previa del composer — nunca
// dupliques esta lógica en otro lado.
//
// Objetivo de diseño: el correo debe leerse como un mensaje personal escrito a
// mano, NO como un correo de ventas o marketing. Sin logo, sin encabezado de
// marca, sin card con bordes de color, sin botones CTA. Solo texto plano en una
// tipografía normal, la firma del agente al final, y un enlace de cancelar
// suscripción muy sutil (requisito legal) en gris pequeño al pie.
//
// Seguridad: todo texto de usuario y todo valor de merge se escapa ANTES de
// interpolar. Los merge tags se resuelven aquí (doble llave); un tag
// desconocido queda literal para que el autor lo vea en el correo de prueba.

export interface MergeVars {
  customer_name: string
  agent_name:    string
  agent_email:   string
  [key: string]: string
}

export type EmailLocale = 'es' | 'en' | 'pt'

const UNSUBSCRIBE_LABEL: Record<EmailLocale, string> = {
  es: 'cancelar suscripción',
  en: 'unsubscribe',
  pt: 'cancelar inscrição',
}

// Stack de fuentes de sistema — lo que usaría un cliente de correo normal.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const TEXT_COLOR = '#1a1a1a'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Reemplaza {{tag}} por el valor correspondiente. `escaped` controla si los
// valores se escapan (true para HTML del cuerpo, false para el asunto en texto
// plano). Tags desconocidos quedan tal cual.
function resolveMergeTags(text: string, vars: MergeVars, escaped: boolean): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key]
    if (value === undefined) return match
    return escaped ? escapeHtml(value) : value
  })
}

// Convierte URLs pegadas como texto en enlaces clickeables (como haría un
// cliente de correo con un mensaje normal). Opera sobre texto YA escapado, así
// que no hay `<` dentro del match; el `&amp;` dentro del href es HTML válido.
function linkifyUrls(escapedText: string): string {
  return escapedText.replace(/https?:\/\/[^\s<]+/g, match => {
    // No arrastrar puntuación de cierre al enlace.
    const trailing = match.match(/[.,;:!?)]+$/)?.[0] ?? ''
    const url = trailing ? match.slice(0, -trailing.length) : match
    return `<a href="${url}" style="color:${TEXT_COLOR};">${url}</a>${trailing}`
  })
}

// Texto libre → párrafos. Bloques separados por línea en blanco se vuelven <p>;
// saltos simples dentro de un bloque se vuelven <br/>. Escapa + resuelve tags
// + linkifica URLs.
function textToParagraphs(text: string, vars: MergeVars): string {
  return text
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => {
      const body = linkifyUrls(resolveMergeTags(escapeHtml(block), vars, true)).replace(/\r?\n/g, '<br/>')
      return `<p style="margin:0 0 16px;${FONT};font-size:15px;line-height:1.6;color:${TEXT_COLOR};">${body}</p>`
    })
    .join('\n')
}

export function renderEmail(params: {
  subject:        string
  content:        EmailContent
  vars:           MergeVars
  // Firma del agente (texto libre multilínea de Configuración → Email). null
  // si el agente no configuró ninguna.
  signature:      string | null
  unsubscribeUrl: string
  locale?:        EmailLocale
}): { subject: string; html: string } {
  const { content, vars, unsubscribeUrl } = params
  const locale = params.locale ?? 'es'

  // Asunto: texto plano — merge sin escape HTML.
  const subject = resolveMergeTags(params.subject, vars, false)

  const bodyHtml = textToParagraphs(content.body, vars)

  const signatureHtml = params.signature && params.signature.trim()
    ? `<p style="margin:22px 0 0;${FONT};font-size:15px;line-height:1.6;color:${TEXT_COLOR};">${
        resolveMergeTags(escapeHtml(params.signature.trim()), vars, true).replace(/\r?\n/g, '<br/>')
      }</p>`
    : ''

  // Unsubscribe muy sutil: gris claro, pequeño, sin marca ni "cancelar
  // suscripción" en mayúsculas — apenas visible, como pide el requisito.
  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
  <div style="max-width:600px;margin:0 auto;padding:28px 24px;">
${bodyHtml}
${signatureHtml}
    <div style="margin-top:36px;${FONT};font-size:11px;line-height:1.5;color:#c2c2c2;">
      <a href="${escapeHtml(unsubscribeUrl)}" style="color:#c2c2c2;text-decoration:underline;">${UNSUBSCRIBE_LABEL[locale]}</a>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}
