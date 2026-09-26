// ── Contexto del lead para el análisis de fit ────────────────────────────────
//
// Formateadores PUROS de las secciones que ai-lead-fit.ts le manda a la IA más
// allá de formularios y lead_events. Viven aparte para poder probarlos sin
// Supabase ni Anthropic: lo que se prueba es QUÉ ve el modelo.
//
// Por qué cada sección existe:
//   · Etiquetas: son hechos que decide una persona ("contactado sin respuesta",
//     "pre-aprobado") y a propósito NO escriben lead_event (ver migración 116).
//     Sin leerlas aquí, la IA nunca se enteraba.
//   · Open houses: la confirmación y la asistencia viven en open_house_rsvps.
//     El evento de asistencia no dice a QUÉ propiedad fue, y el "no asistió"
//     no genera evento alguno.
//   · Notas, prestamista, presupuesto, procedencia, correos del lead, proceso de
//     compra y secuencias activas: todo lo que un agente leería en la ficha
//     antes de llamar.

const day = (iso: string | null | undefined) => (iso ? String(iso).slice(0, 10) : '')
const clip = (v: unknown, max: number) => {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

export interface TagRow {
  created_at: string
  lead_tags: { name: string; description: string | null } | { name: string; description: string | null }[] | null
}

export function formatTagLines(rows: TagRow[]): string[] {
  return rows
    .map(r => ({ tag: one(r.lead_tags), at: r.created_at }))
    .filter((r): r is { tag: { name: string; description: string | null }; at: string } => !!r.tag?.name)
    .map(({ tag, at }) => `- ${tag.name}${tag.description ? ` — ${clip(tag.description, 200)}` : ''} (desde ${day(at)})`)
}

type PropertyRef = { name: string | null; address: string | null; city: string | null }
type OpenHouseRef = {
  starts_at: string
  status: string
  properties: PropertyRef | PropertyRef[] | null
}
export interface RsvpRow {
  response: 'yes' | 'no' | string
  guests: number | null
  attended: boolean | null
  updated_at: string
  open_houses: OpenHouseRef | OpenHouseRef[] | null
}

export function formatOpenHouseLines(rows: RsvpRow[], now: Date = new Date()): string[] {
  const lines: string[] = []
  for (const r of rows) {
    const oh = one(r.open_houses)
    if (!oh) continue
    const p = one(oh.properties)
    const where = [p?.name || p?.address, p?.city].filter(Boolean).join(', ') || 'una propiedad'
    const upcoming = new Date(oh.starts_at).getTime() > now.getTime()
    const parts: string[] = []
    if (r.response === 'yes') {
      parts.push(`confirmó que iría${r.guests ? ` con ${r.guests} acompañante${r.guests === 1 ? '' : 's'}` : ''}`)
    } else {
      parts.push('respondió que NO iría')
    }
    if (oh.status === 'cancelled') parts.push('el open house se canceló')
    else if (upcoming) parts.push('todavía no ocurre')
    else if (r.attended === true) parts.push('ASISTIÓ en persona')
    else if (r.attended === false) parts.push('no se presentó')
    else if (r.response === 'yes') parts.push('asistencia sin marcar')
    lines.push(`- ${day(oh.starts_at)} Open house en ${where}: ${parts.join('; ')}.`)
  }
  return lines
}

export interface ReplyRow { subject: string | null; body_text: string | null; received_at: string }

export function formatReplyLines(rows: ReplyRow[]): string[] {
  return rows
    .filter(r => r.body_text || r.subject)
    .map(r => `- ${day(r.received_at)}${r.subject ? ` «${clip(r.subject, 120)}»` : ''}: ${clip(r.body_text, 500) || '(sin texto)'}`)
}

export interface PurchaseRow {
  address: string | null
  loan_type: string | null
  closing_date: string | null
  notes: string | null
  completed_at: string | null
}

export function formatPurchaseLines(rows: PurchaseRow[]): string[] {
  return rows.map(r => {
    const bits = [
      r.address ? `propiedad ${clip(r.address, 150)}` : null,
      r.loan_type ? `préstamo ${r.loan_type}` : null,
      r.closing_date ? `cierre ${day(r.closing_date)}` : null,
      r.completed_at ? `completado ${day(r.completed_at)}` : 'en curso',
      r.notes ? `notas: ${clip(r.notes, 300)}` : null,
    ].filter(Boolean)
    return `- Proceso de compra: ${bits.join('; ')}.`
  })
}

type SequenceRef = { name: string | null }
export interface SequenceRunRow {
  status: string
  started_at: string | null
  email_sequences: SequenceRef | SequenceRef[] | null
}

export function formatSequenceLines(rows: SequenceRunRow[]): string[] {
  return rows.map(r => {
    const name = one(r.email_sequences)?.name || 'secuencia sin nombre'
    return `- ${name} (${r.status}${r.started_at ? `, desde ${day(r.started_at)}` : ''})`
  })
}
