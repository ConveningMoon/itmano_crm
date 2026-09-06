import { describe, it, expect } from 'vitest'
import { stripQuotedReply } from '@/lib/email/strip-quoted-reply'

// ── Real Outlook body from DB (2026-06-20) ─────────────────────────────────────
const REAL_OUTLOOK_BODY = [
  'Prueba 4 de repsuesta',
  '________________________________',
  'De: Adriana <adriana@mail.ajrealestateva.com>',
  'Enviado: viernes, 19 de junio de 2026 12:37 a. m.',
  'Para: dj.vergara@outlook.es <dj.vergara@outlook.es>',
  'Asunto: Aquí está tu guía gratuita!',
  '',
  'Hola Test,',
  '',
  'Te escribo yo misma porque quiero que sepas que esto no es un correo automático.',
  '________________________________',
  '',
  'You are receiving this email because you opted in via our site.',
  'Want to change how you receive these emails?',
  'You can unsubscribe from this list.',
].join('\n')

describe('stripQuotedReply', () => {
  it('cuts at Outlook underscore separator — real body from DB', () => {
    expect(stripQuotedReply(REAL_OUTLOOK_BODY)).toBe('Prueba 4 de repsuesta')
  })

  it('cuts at Outlook separator even with multiple trailing blank lines in the reply', () => {
    const input = 'Hola, me interesa!\n\n\n________________________________\nDe: x <x@x.com>\nEnviado: ayer'
    expect(stripQuotedReply(input)).toBe('Hola, me interesa!')
  })

  it('cuts at De:/Enviado: header block when no underscore is present', () => {
    const input = [
      'Me interesan los programas.',
      'De: Adriana <adriana@mail.ajrealestateva.com>',
      'Enviado: viernes, 20 de junio de 2026 9:00 a. m.',
      'Para: lead@example.com',
      'Asunto: Tu guía',
      '',
      'Cuerpo original...',
    ].join('\n')
    expect(stripQuotedReply(input)).toBe('Me interesan los programas.')
  })

  it('cuts at From:/Sent: header block (English client)', () => {
    const input = [
      'Thank you for the guide!',
      'From: Adriana <adriana@mail.ajrealestateva.com>',
      'Sent: Friday, June 20, 2026 9:00 AM',
      'To: lead@example.com',
      'Subject: Your free guide',
      '',
      'Original message...',
    ].join('\n')
    expect(stripQuotedReply(input)).toBe('Thank you for the guide!')
  })

  it('cuts at Gmail single-line "El … escribió:"', () => {
    const input = [
      'Gracias!',
      'El 20 de junio de 2026, a las 10:47, Adriana <adriana@mail.ajrealestateva.com> escribió:',
      '> Hola,',
      '> Te escribo porque...',
    ].join('\n')
    expect(stripQuotedReply(input)).toBe('Gracias!')
  })

  it('cuts at Gmail single-line "On … wrote:" (English)', () => {
    const input = [
      'Sounds great!',
      'On Jun 20, 2026, at 10:47 AM, Adriana <adriana@mail.ajrealestateva.com> wrote:',
      '> Hello,',
    ].join('\n')
    expect(stripQuotedReply(input)).toBe('Sounds great!')
  })

  it('cuts at Gmail multi-line "El … / escribió:" spanning two lines', () => {
    const input = [
      'Me parece bien.',
      'El mar., 21 de jun. de 2026, 10:47, Adriana Meléndez <',
      'adriana@mail.ajrealestateva.com> escribió:',
      '',
      '> Hola,',
    ].join('\n')
    expect(stripQuotedReply(input)).toBe('Me parece bien.')
  })

  it('cuts at classic ">" quoted-reply lines', () => {
    const input = [
      'Claro que sí',
      '> -----Original Message-----',
      '> From: Adriana',
      '> Subject: Tu guía',
    ].join('\n')
    expect(stripQuotedReply(input)).toBe('Claro que sí')
  })

  it('returns full text when no quote marker is found', () => {
    const input = '¿Cuándo podemos hablar para saber más sobre el proceso de compra?'
    expect(stripQuotedReply(input)).toBe(input)
  })

  it('returns full multi-line text when no quote marker is found', () => {
    const input = 'Hola Adriana,\n\nMe gustaría agendar una cita.\n\nGracias.'
    expect(stripQuotedReply(input)).toBe(input)
  })

  it('does NOT cut when "De:" appears mid-sentence (not at line start)', () => {
    // "De:" is buried in the middle of a sentence — line starts with "Hola!"
    const input = 'Hola! De: parte de mi familia nos interesa mucho.'
    expect(stripQuotedReply(input)).toBe(input)
  })

  it('does NOT cut when "De:" starts a line but next line is NOT "Enviado:"', () => {
    // "De:" starts the line but lookahead fails — not a header block
    const input = 'Tengo una pregunta.\nDe: repente me acordé que tengo pre-aprobación.'
    expect(stripQuotedReply(input)).toBe(input)
  })

  it('does NOT cut when "From:" starts a line but next line is NOT "Sent:"', () => {
    const input = 'Let me know.\nFrom what I understand, I need a pre-approval letter first.'
    expect(stripQuotedReply(input)).toBe(input)
  })

  it('trims trailing blank lines from the cut result', () => {
    const input = 'Listo!\n\n\n________________________________\nDe: x\nEnviado: y'
    expect(stripQuotedReply(input)).toBe('Listo!')
  })

  it('handles email with only quote content — returns empty string (trimEnd of empty)', () => {
    // Everything is quote, nothing before the separator
    const input = '________________________________\nDe: x\nEnviado: y'
    expect(stripQuotedReply(input)).toBe('')
  })
})
