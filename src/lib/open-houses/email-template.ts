import 'server-only'
import type { EmailContent } from '@/lib/email-content'
import { escapeHtml, resolveMergeTags, textToParagraphs, unsubscribeLabel, type MergeVars, type EmailLocale } from '@/lib/services/email-render'
import type { OpenHouseEmailKind } from './model'

// Plantilla HTML de los correos de open house.
//
// Los demás correos del CRM se ven como un mensaje escrito a mano (sin marca ni
// botones), y es a propósito: son seguimientos personales. Un open house es
// otra cosa — una INVITACIÓN a ver una casa—, y ahí la casa es el mensaje: tres
// fotos, la fecha en una tarjeta que se lee de un vistazo y botones grandes
// para confirmar, agendar y llegar. El texto del agente (el del composer) sigue
// siendo personal y va entre la tarjeta y los botones.
//
// HTML de correo, no de web: tablas, estilos inline y botones "a prueba de
// Outlook" (celda con fondo + enlace). Todo texto de usuario se escapa; las
// URLs vienen del servidor y también se escapan al interpolarlas.

export interface OpenHouseEmailInput {
  kind:           OpenHouseEmailKind
  locale:         EmailLocale
  subject:        string
  content:        EmailContent
  vars:           MergeVars
  signature:      string | null
  unsubscribeUrl: string
  brand: {
    name:    string
    logoUrl: string | null
    accent:  string | null
  }
  property: {
    title:   string
    address: string
    /** Portada y las dos primeras de la galería, en ese orden. */
    images:  string[]
  }
  event: {
    date:  string
    time:  string
    notes: string | null
  }
  links: {
    rsvp:           string | null
    calendar:       string
    googleCalendar: string
    property:       string | null
    maps:           string
  }
}

const COPY: Record<string, {
  eyebrow: Record<OpenHouseEmailKind, string>
  rsvp: string; rsvpChange: string; calendar: string; google: string; property: string; maps: string
  when: string; where: string
}> = {
  es: {
    eyebrow: { announcement: 'Open house', reminder: 'Recordatorio · Open house', update: 'Nueva fecha · Open house', cancellation: 'Open house cancelado' },
    rsvp: 'Confirmar asistencia', rsvpChange: 'Cambiar mi respuesta', calendar: 'Apple / Outlook',
    google: 'Google Calendar', property: 'Ver la propiedad', maps: 'Cómo llegar', when: 'Cuándo', where: 'Dónde',
  },
  en: {
    eyebrow: { announcement: 'Open house', reminder: 'Reminder · Open house', update: 'New date · Open house', cancellation: 'Open house cancelled' },
    rsvp: 'RSVP', rsvpChange: 'Change my answer', calendar: 'Apple / Outlook',
    google: 'Google Calendar', property: 'See the property', maps: 'Get directions', when: 'When', where: 'Where',
  },
  pt: {
    eyebrow: { announcement: 'Open house', reminder: 'Lembrete · Open house', update: 'Nova data · Open house', cancellation: 'Open house cancelado' },
    rsvp: 'Confirmar presença', rsvpChange: 'Mudar minha resposta', calendar: 'Apple / Outlook',
    google: 'Google Calendar', property: 'Ver o imóvel', maps: 'Como chegar', when: 'Quando', where: 'Onde',
  },
}

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
const INK = '#16202B'
const SOFT = '#5B6570'
const LINE = '#E7E3DC'
const PAPER = '#F4F1EC'
const DEFAULT_ACCENT = '#C9A96E'

/** Negro o blanco, lo que se lea mejor sobre el color de la marca. */
function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#FFFFFF'
  const n = parseInt(m[1], 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return luminance > 0.45 ? INK : '#FFFFFF'
}

function safeAccent(accent: string | null): string {
  return accent && /^#[0-9a-f]{6}$/i.test(accent) ? accent : DEFAULT_ACCENT
}

function button(href: string, label: string, bg: string, fg: string, opts: { bordered?: boolean; small?: boolean } = {}): string {
  const border = opts.bordered ? `border:1px solid ${LINE};` : ''
  const pad  = opts.small ? '9px 16px' : '14px 26px'
  const size = opts.small ? '13px' : '15px'
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table;margin:0 8px 10px 0;">
  <tr><td align="center" bgcolor="${bg}" style="border-radius:999px;${border}">
    <a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:${pad};font-family:${FONT};font-size:${size};font-weight:600;line-height:1;color:${fg};text-decoration:none;border-radius:999px;">${escapeHtml(label)}</a>
  </td></tr>
</table>`
}

function images(list: string[], title: string, muted: boolean): string {
  const [hero, ...rest] = list.slice(0, 3)
  if (!hero) return ''
  const filter = muted ? 'filter:grayscale(100%);opacity:0.75;' : ''
  const alt = escapeHtml(title)
  const heroHtml = `<tr><td style="padding:0;">
    <img src="${escapeHtml(hero)}" width="600" alt="${alt}" style="display:block;width:100%;max-width:600px;height:auto;border:0;${filter}" />
  </td></tr>`
  if (rest.length === 0) return heroHtml
  const cells = rest.map((src, i) => `<td width="50%" style="padding:${i === 0 ? '6px 3px 0 0' : '6px 0 0 3px'};">
      <img src="${escapeHtml(src)}" width="297" alt="${alt}" style="display:block;width:100%;height:auto;border:0;${filter}" />
    </td>`).join('')
  return `${heroHtml}
  <tr><td style="padding:0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}${rest.length === 1 ? '<td width="50%"></td>' : ''}</tr></table>
  </td></tr>`
}

export function renderOpenHouseEmail(i: OpenHouseEmailInput): { subject: string; html: string } {
  const C = COPY[i.locale] ?? COPY.en
  const accent = safeAccent(i.brand.accent)
  const onAccent = textOn(accent)
  const cancelled = i.kind === 'cancellation'
  const subject = resolveMergeTags(i.subject, i.vars, false)
  const body = textToParagraphs(i.content.body, i.vars)

  const signature = i.signature?.trim()
    ? `<p style="margin:20px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${INK};">${
        resolveMergeTags(escapeHtml(i.signature.trim()), i.vars, true).replace(/\r?\n/g, '<br/>')
      }</p>`
    : ''

  const header = i.brand.logoUrl
    ? `<img src="${escapeHtml(i.brand.logoUrl)}" height="36" alt="${escapeHtml(i.brand.name)}" style="display:block;height:36px;width:auto;border:0;margin:0 auto;" />`
    : `<span style="font-family:${FONT};font-size:17px;font-weight:700;color:${INK};letter-spacing:-0.01em;">${escapeHtml(i.brand.name)}</span>`

  const notes = i.event.notes?.trim() && !cancelled
    ? `<p style="margin:10px 0 0;font-family:${FONT};font-size:13px;line-height:1.5;color:${SOFT};">${escapeHtml(i.event.notes.trim())}</p>`
    : ''

  const eventCard = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;background:${PAPER};border-radius:14px;">
  <tr><td style="padding:18px 20px;border-left:4px solid ${cancelled ? SOFT : accent};border-radius:14px;">
    <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${SOFT};">${C.when}</p>
    <p style="margin:0;font-family:${FONT};font-size:17px;font-weight:700;color:${INK};${cancelled ? 'text-decoration:line-through;' : ''}">${escapeHtml(i.event.date)}</p>
    <p style="margin:2px 0 14px;font-family:${FONT};font-size:14px;color:${SOFT};">${escapeHtml(i.event.time)}</p>
    <p style="margin:0 0 4px;font-family:${FONT};font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${SOFT};">${C.where}</p>
    <p style="margin:0;font-family:${FONT};font-size:14px;color:${INK};">${escapeHtml(i.property.address)}</p>
    ${notes}
  </td></tr>
</table>`

  // Dos niveles: la acción principal (confirmar) y la propiedad, grandes;
  // calendario y cómo llegar, más discretos debajo.
  const primary: string[] = []
  if (!cancelled && i.links.rsvp) {
    primary.push(button(i.links.rsvp, i.kind === 'reminder' ? C.rsvpChange : C.rsvp, accent, onAccent))
  }
  if (i.links.property) primary.push(button(i.links.property, C.property, '#FFFFFF', INK, { bordered: true }))
  const secondary: string[] = cancelled ? [] : [
    button(i.links.googleCalendar, C.google, '#FFFFFF', SOFT, { bordered: true, small: true }),
    button(i.links.calendar, C.calendar, '#FFFFFF', SOFT, { bordered: true, small: true }),
    button(i.links.maps, C.maps, '#FFFFFF', SOFT, { bordered: true, small: true }),
  ]
  const buttonsHtml = [
    primary.length ? `<div>${primary.join('\n')}</div>` : '',
    secondary.length ? `<div style="margin-top:4px;">${secondary.join('\n')}</div>` : '',
  ].join('')

  const html = `<!DOCTYPE html>
<html lang="${i.locale}">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <meta name="color-scheme" content="light only"/>
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAPER};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAPER};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#FFFFFF;border-radius:18px;overflow:hidden;border:1px solid ${LINE};">
        <tr><td align="center" style="padding:22px 24px;border-bottom:1px solid ${LINE};">${header}</td></tr>
        ${images(i.property.images, i.property.title, cancelled)}
        <tr><td style="padding:30px 32px 8px;">
          <p style="margin:0 0 8px;font-family:${FONT};font-size:12px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${cancelled ? SOFT : accent};">${escapeHtml(C.eyebrow[i.kind])}</p>
          <h1 style="margin:0 0 20px;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:800;letter-spacing:-0.015em;color:${INK};">${escapeHtml(i.property.title)}</h1>
          ${eventCard}
          ${body}
          ${signature}
        </td></tr>
        ${buttonsHtml ? `<tr><td style="padding:14px 32px 30px;">${buttonsHtml}</td></tr>` : '<tr><td style="padding:0 0 22px;"></td></tr>'}
      </table>
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <tr><td align="center" style="padding:18px 24px;font-family:${FONT};font-size:11px;line-height:1.6;color:#9A9FA6;">
          ${escapeHtml(i.brand.name)} · <a href="${escapeHtml(i.unsubscribeUrl)}" style="color:#9A9FA6;text-decoration:underline;">${unsubscribeLabel(i.locale)}</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`

  return { subject, html }
}

/** Enlace "Cómo llegar" de Google Maps para una dirección. */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
}
