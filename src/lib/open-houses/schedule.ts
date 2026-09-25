// Reglas de agenda de un open house: validar la franja del evento, cuándo sale
// cada correo, y qué pasa al reprogramar o cancelar. Módulo PURO — todas las
// fechas entran como parámetro (`now` incluido) para poder probar cada
// conflicto sin reloj ni base.
//
// El orquestador que despacha los correos corre una vez por hora. Por eso una
// hora programada es "a partir de": el correo sale en la siguiente ejecución.

import type { OpenHouseEmailKind, OpenHouseEmailStatus, OpenHouseStatus } from './model'

const HOUR = 60 * 60 * 1000
const DAY  = 24 * HOUR

export const MAX_EVENT_HOURS     = 12
export const MAX_DAYS_AHEAD      = 365
/** Un anuncio con menos margen que esto se permite, pero se advierte. */
export const RECOMMENDED_NOTICE_HOURS = 24
/** Antelación por defecto del recordatorio respecto al inicio del evento. */
export const DEFAULT_REMINDER_HOURS   = 24
/** Si no cabe el de 24 h, se intenta uno de 3 h antes. */
export const FALLBACK_REMINDER_HOURS  = 3

// ── Zonas horarias ───────────────────────────────────────────────────────────

export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function partsIn(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const get = (type: string) => Number(fmt.formatToParts(date).find(p => p.type === type)?.value)
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), min: get('minute'), s: get('second') }
}

/** Desfase (ms) de `timeZone` respecto a UTC en el instante `date`. */
function offsetAt(date: Date, timeZone: string): number {
  const p = partsIn(date, timeZone)
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Hora de pared en una zona (lo que escribe el agente: "2026-10-03", "11:00",
 * "America/New_York") → instante UTC. Devuelve null si la fecha no existe o
 * cae en el hueco de un cambio de horario (las 2:30 del día que se adelanta
 * el reloj no ocurren): mejor rechazarla que mover el evento sin avisar.
 */
export function zonedWallTimeToUtc(date: string, time: string, timeZone: string): Date | null {
  const dm = DATE_RE.exec(date)
  const tm = TIME_RE.exec(time)
  if (!dm || !tm || !isValidTimeZone(timeZone)) return null
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])]
  const [h, mi]    = [Number(tm[1]), Number(tm[2])]

  const naive = Date.UTC(y, mo - 1, d, h, mi)
  // Dos pasadas: el desfase depende del instante, que depende del desfase.
  let guess = naive - offsetAt(new Date(naive), timeZone)
  guess     = naive - offsetAt(new Date(guess), timeZone)

  const back = partsIn(new Date(guess), timeZone)
  if (back.y !== y || back.m !== mo || back.d !== d || back.h !== h || back.min !== mi) return null
  return new Date(guess)
}

/** Instante UTC → { date: 'YYYY-MM-DD', time: 'HH:mm' } en la zona dada. */
export function utcToZonedWallTime(instant: Date | string, timeZone: string): { date: string; time: string } {
  const p = partsIn(new Date(instant), timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${p.y}-${pad(p.m)}-${pad(p.d)}`, time: `${pad(p.h)}:${pad(p.min)}` }
}

// ── La franja del evento ─────────────────────────────────────────────────────

export type ValidationResult =
  | { ok: true; warnings: string[] }
  | { ok: false; error: string }

export function validateEventWindow(args: {
  startsAt: Date
  endsAt:   Date
  now:      Date
}): ValidationResult {
  const { startsAt, endsAt, now } = args
  if (endsAt.getTime() <= startsAt.getTime()) {
    return { ok: false, error: 'La hora de término debe ser posterior a la de inicio.' }
  }
  if (endsAt.getTime() - startsAt.getTime() > MAX_EVENT_HOURS * HOUR) {
    return { ok: false, error: `Un open house no puede durar más de ${MAX_EVENT_HOURS} horas.` }
  }
  if (startsAt.getTime() <= now.getTime()) {
    return { ok: false, error: 'El open house debe empezar en el futuro.' }
  }
  if (startsAt.getTime() - now.getTime() > MAX_DAYS_AHEAD * DAY) {
    return { ok: false, error: 'Sólo se pueden programar open houses dentro del próximo año.' }
  }
  return { ok: true, warnings: [] }
}

/** Dos franjas [inicio, fin) se pisan. Mismo criterio que el EXCLUDE de la base. */
export function windowsOverlap(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime()
}

// ── Cuándo sale cada correo ──────────────────────────────────────────────────

/**
 * Hora de salida del anuncio. `null` en `scheduledAt` significa "al
 * confirmar". Una hora ya pasada al momento de confirmar se trata igual.
 */
export function validateAnnouncementAt(args: {
  scheduledAt: Date | null
  startsAt:    Date
  now:         Date
}): ValidationResult {
  const { startsAt, now } = args
  const at = args.scheduledAt && args.scheduledAt.getTime() > now.getTime() ? args.scheduledAt : now
  if (at.getTime() >= startsAt.getTime()) {
    return { ok: false, error: 'El anuncio tiene que salir antes de que empiece el open house.' }
  }
  const warnings: string[] = []
  if (startsAt.getTime() - at.getTime() < RECOMMENDED_NOTICE_HOURS * HOUR) {
    warnings.push(`El anuncio sale con menos de ${RECOMMENDED_NOTICE_HOURS} horas de anticipación: pocos leads podrán organizarse para ir.`)
  }
  return { ok: true, warnings }
}

export function validateReminderAt(args: {
  reminderAt:     Date
  announcementAt: Date
  startsAt:       Date
  now:            Date
}): ValidationResult {
  const { reminderAt, announcementAt, startsAt, now } = args
  if (reminderAt.getTime() <= now.getTime()) {
    return { ok: false, error: 'El recordatorio tiene que programarse en el futuro.' }
  }
  if (reminderAt.getTime() <= announcementAt.getTime()) {
    return { ok: false, error: 'El recordatorio tiene que salir después del anuncio.' }
  }
  if (reminderAt.getTime() >= startsAt.getTime()) {
    return { ok: false, error: 'El recordatorio tiene que salir antes de que empiece el open house.' }
  }
  const warnings: string[] = []
  // Con el orquestador horario, un recordatorio a menos de una hora del
  // anuncio puede salir en la misma ejecución y llegar casi pegado.
  if (reminderAt.getTime() - announcementAt.getTime() < 2 * HOUR) {
    warnings.push('El recordatorio sale casi a la vez que el anuncio: puede llegar pegado.')
  }
  return { ok: true, warnings }
}

/**
 * Recordatorio por defecto: 24 h antes; si eso ya pasó o cae antes del
 * anuncio, 3 h antes; si tampoco cabe, ninguno.
 */
export function defaultReminderAt(args: {
  startsAt:       Date
  announcementAt: Date
  now:            Date
}): Date | null {
  for (const hours of [DEFAULT_REMINDER_HOURS, FALLBACK_REMINDER_HOURS]) {
    const candidate = new Date(args.startsAt.getTime() - hours * HOUR)
    const ok = validateReminderAt({ reminderAt: candidate, announcementAt: args.announcementAt, startsAt: args.startsAt, now: args.now })
    if (ok.ok) return candidate
  }
  return null
}

// ── Qué se puede tocar según el estado ───────────────────────────────────────

/** El contenido de un correo sólo se edita mientras no ha empezado a salir. */
export function isEmailEditable(status: OpenHouseEmailStatus): boolean {
  return status === 'pending'
}

/** Un borrador se borra; uno confirmado se cancela (su historial se conserva). */
export function canDeleteOpenHouse(status: OpenHouseStatus): boolean {
  return status === 'draft'
}

// ── Reprogramar y cancelar ───────────────────────────────────────────────────

export interface ChangeContext {
  status:             OpenHouseStatus
  announcementStatus: OpenHouseEmailStatus | null
  reminder:           { status: OpenHouseEmailStatus; scheduledAt: Date } | null
  /** ¿Hay avisos de cambio pendientes de salir? (uno a la vez) */
  hasPendingNotice:   boolean
  endsAt:             Date
  now:                Date
}

export type ChangePlan =
  | { ok: false; error: string }
  | {
      ok: true
      /** El anuncio ya salió: el cambio se avisa por correo a sus destinatarios. */
      notify: boolean
      /** Qué hacer con el recordatorio pendiente, si lo hay. */
      reminder: 'none' | 'keep' | 'move' | 'cancel'
    }

function blockedWhileSending(ctx: ChangeContext): string | null {
  if (ctx.announcementStatus === 'sending') {
    return 'El anuncio se está enviando ahora mismo. Espera a que termine para cambiar el open house.'
  }
  if (ctx.reminder?.status === 'sending') {
    return 'El recordatorio se está enviando ahora mismo. Espera a que termine.'
  }
  if (ctx.hasPendingNotice) {
    return 'Hay un aviso anterior que todavía no sale. Espera a que se envíe antes de hacer otro cambio.'
  }
  return null
}

/**
 * Reprogramar un open house confirmado. Un borrador se edita libremente y no
 * pasa por aquí.
 *
 *   · Si el anuncio ya salió, se avisa (`notify`) a quien lo recibió.
 *   · Si el anuncio no salió, no hace falta avisar: saldrá con la hora nueva.
 *   · Un recordatorio pendiente se mueve para conservar su antelación; si ya
 *     salió no se repite — el aviso de cambio cumple ese papel.
 */
export function planReschedule(ctx: ChangeContext & {
  newStartsAt: Date
  oldStartsAt: Date
}): ChangePlan {
  if (ctx.status !== 'scheduled') return { ok: false, error: 'Sólo se reprograma un open house confirmado.' }
  if (ctx.endsAt.getTime() <= ctx.now.getTime()) return { ok: false, error: 'Este open house ya terminó.' }
  const blocked = blockedWhileSending(ctx)
  if (blocked) return { ok: false, error: blocked }

  const notify = ctx.announcementStatus === 'sent'

  let reminder: 'none' | 'keep' | 'move' | 'cancel' = 'none'
  if (ctx.reminder && ctx.reminder.status === 'pending') {
    const lead = ctx.oldStartsAt.getTime() - ctx.reminder.scheduledAt.getTime()
    const moved = ctx.newStartsAt.getTime() - lead
    reminder = moved > ctx.now.getTime() ? 'move' : 'cancel'
  } else if (ctx.reminder) {
    reminder = 'keep'
  }
  return { ok: true, notify, reminder }
}

export function planCancel(ctx: ChangeContext): ChangePlan {
  if (ctx.status === 'cancelled') return { ok: false, error: 'Este open house ya está cancelado.' }
  if (ctx.status === 'draft')     return { ok: false, error: 'Un borrador no se cancela: se elimina.' }
  if (ctx.endsAt.getTime() <= ctx.now.getTime()) return { ok: false, error: 'Este open house ya terminó.' }
  const blocked = blockedWhileSending(ctx)
  if (blocked) return { ok: false, error: blocked }

  const notify = ctx.announcementStatus === 'sent'
  const reminder = ctx.reminder
    ? (ctx.reminder.status === 'pending' ? 'cancel' : 'keep')
    : 'none'
  return { ok: true, notify, reminder }
}

/** Qué correos salen al confirmar y con qué hora efectiva. */
export function effectiveSendAt(scheduledAt: Date, now: Date): Date {
  return scheduledAt.getTime() > now.getTime() ? scheduledAt : now
}

/** El correo de un tipo dado necesita contenido en todos los idiomas del evento. */
export function missingLanguages(
  languages: string[],
  contents:  { language: string; ready: boolean }[],
): string[] {
  const ready = new Set(contents.filter(c => c.ready).map(c => c.language))
  return languages.filter(l => !ready.has(l))
}

export function kindNeedsOpenHouseScheduled(kind: OpenHouseEmailKind): boolean {
  return kind !== 'cancellation'
}
