import { describe, it, expect } from 'vitest'
import {
  zonedWallTimeToUtc, utcToZonedWallTime, validateEventWindow, windowsOverlap,
  validateAnnouncementAt, validateReminderAt, defaultReminderAt, planReschedule, planCancel,
  effectiveSendAt, missingLanguages, type ChangeContext,
} from '@/lib/open-houses/schedule'

// Reglas de agenda de un open house. Cada caso fija un CONFLICTO que no puede
// terminar en un correo equivocado: una hora que no existe, un anuncio que
// sale después del evento, un recordatorio antes del anuncio, un cambio
// mientras se está enviando.

const H = 60 * 60 * 1000
const NOW = new Date('2026-10-01T12:00:00Z')

describe('zonas horarias', () => {
  it('convierte la hora de pared de Nueva York a UTC (horario de verano)', () => {
    // 3 oct 2026: EDT, UTC-4
    expect(zonedWallTimeToUtc('2026-10-03', '11:00', 'America/New_York')?.toISOString()).toBe('2026-10-03T15:00:00.000Z')
  })

  it('convierte en horario estándar', () => {
    // 5 dic 2026: EST, UTC-5
    expect(zonedWallTimeToUtc('2026-12-05', '11:00', 'America/New_York')?.toISOString()).toBe('2026-12-05T16:00:00.000Z')
  })

  it('rechaza una hora que no existe por el cambio de horario', () => {
    // 8 mar 2026 en Nueva York: de 2:00 se salta a 3:00.
    expect(zonedWallTimeToUtc('2026-03-08', '02:30', 'America/New_York')).toBeNull()
  })

  it('rechaza fechas, horas y zonas inválidas', () => {
    expect(zonedWallTimeToUtc('2026-02-30', '10:00', 'America/New_York')).toBeNull()
    expect(zonedWallTimeToUtc('2026-10-03', '25:00', 'America/New_York')).toBeNull()
    expect(zonedWallTimeToUtc('2026-10-03', '10:00', 'Mars/Olympus')).toBeNull()
  })

  it('ida y vuelta conserva la hora de pared', () => {
    const utc = zonedWallTimeToUtc('2026-10-03', '09:30', 'America/Mexico_City')!
    expect(utcToZonedWallTime(utc, 'America/Mexico_City')).toEqual({ date: '2026-10-03', time: '09:30' })
  })
})

describe('franja del evento', () => {
  const start = new Date(NOW.getTime() + 48 * H)

  it('acepta una franja futura y razonable', () => {
    expect(validateEventWindow({ startsAt: start, endsAt: new Date(start.getTime() + 3 * H), now: NOW }).ok).toBe(true)
  })

  it('rechaza fin antes del inicio, más de 12 h, pasado y más de un año', () => {
    expect(validateEventWindow({ startsAt: start, endsAt: start, now: NOW }).ok).toBe(false)
    expect(validateEventWindow({ startsAt: start, endsAt: new Date(start.getTime() + 13 * H), now: NOW }).ok).toBe(false)
    expect(validateEventWindow({ startsAt: new Date(NOW.getTime() - H), endsAt: NOW, now: NOW }).ok).toBe(false)
    const far = new Date(NOW.getTime() + 400 * 24 * H)
    expect(validateEventWindow({ startsAt: far, endsAt: new Date(far.getTime() + H), now: NOW }).ok).toBe(false)
  })

  it('detecta solapamientos con el mismo criterio [inicio, fin) que la base', () => {
    const a = { startsAt: new Date('2026-10-03T15:00Z'), endsAt: new Date('2026-10-03T17:00Z') }
    expect(windowsOverlap(a, { startsAt: new Date('2026-10-03T16:00Z'), endsAt: new Date('2026-10-03T18:00Z') })).toBe(true)
    // Uno termina justo cuando el otro empieza: no se pisan.
    expect(windowsOverlap(a, { startsAt: new Date('2026-10-03T17:00Z'), endsAt: new Date('2026-10-03T18:00Z') })).toBe(false)
  })
})

describe('horario de los correos', () => {
  const startsAt = new Date(NOW.getTime() + 72 * H)

  it('"al confirmar" (null) o una hora pasada salen ahora', () => {
    expect(validateAnnouncementAt({ scheduledAt: null, startsAt, now: NOW }).ok).toBe(true)
    expect(effectiveSendAt(new Date(NOW.getTime() - H), NOW)).toEqual(NOW)
  })

  it('el anuncio no puede salir después del inicio', () => {
    const res = validateAnnouncementAt({ scheduledAt: new Date(startsAt.getTime() + H), startsAt, now: NOW })
    expect(res.ok).toBe(false)
  })

  it('advierte cuando el anuncio sale con menos de 24 h', () => {
    const res = validateAnnouncementAt({ scheduledAt: new Date(startsAt.getTime() - 5 * H), startsAt, now: NOW })
    expect(res.ok && res.warnings.length).toBe(1)
  })

  it('el recordatorio va después del anuncio y antes del evento', () => {
    const announcementAt = new Date(NOW.getTime() + H)
    expect(validateReminderAt({ reminderAt: new Date(NOW.getTime() + 30 * 60 * 1000), announcementAt, startsAt, now: NOW }).ok).toBe(false)
    expect(validateReminderAt({ reminderAt: new Date(startsAt.getTime() + H), announcementAt, startsAt, now: NOW }).ok).toBe(false)
    expect(validateReminderAt({ reminderAt: new Date(startsAt.getTime() - 24 * H), announcementAt, startsAt, now: NOW }).ok).toBe(true)
  })

  it('el recordatorio por defecto es 24 h antes; si no cabe, 3 h; si tampoco, ninguno', () => {
    expect(defaultReminderAt({ startsAt, announcementAt: NOW, now: NOW })).toEqual(new Date(startsAt.getTime() - 24 * H))
    const soon = new Date(NOW.getTime() + 10 * H)
    expect(defaultReminderAt({ startsAt: soon, announcementAt: NOW, now: NOW })).toEqual(new Date(soon.getTime() - 3 * H))
    const verySoon = new Date(NOW.getTime() + 2 * H)
    expect(defaultReminderAt({ startsAt: verySoon, announcementAt: NOW, now: NOW })).toBeNull()
  })

  it('reporta los idiomas sin contenido listo', () => {
    expect(missingLanguages(['es', 'en', 'pt'], [
      { language: 'es', ready: true }, { language: 'en', ready: false },
    ])).toEqual(['en', 'pt'])
  })
})

describe('reprogramar y cancelar', () => {
  const base: ChangeContext = {
    status: 'scheduled',
    announcementStatus: 'sent',
    reminder: { status: 'pending', scheduledAt: new Date(NOW.getTime() + 24 * H) },
    hasPendingNotice: false,
    endsAt: new Date(NOW.getTime() + 51 * H),
    now: NOW,
  }
  const oldStartsAt = new Date(NOW.getTime() + 48 * H)

  it('si el anuncio ya salió, reprogramar avisa y mueve el recordatorio', () => {
    const plan = planReschedule({ ...base, oldStartsAt, newStartsAt: new Date(NOW.getTime() + 96 * H) })
    expect(plan).toEqual({ ok: true, notify: true, reminder: 'move' })
  })

  it('si el anuncio no salió, reprogramar no avisa a nadie', () => {
    const plan = planReschedule({ ...base, announcementStatus: 'pending', oldStartsAt, newStartsAt: new Date(NOW.getTime() + 96 * H) })
    expect(plan.ok && plan.notify).toBe(false)
  })

  it('cancela el recordatorio si al moverlo quedaría en el pasado', () => {
    const plan = planReschedule({ ...base, oldStartsAt, newStartsAt: new Date(NOW.getTime() + 10 * H) })
    expect(plan.ok && plan.reminder).toBe('cancel')
  })

  it('no permite cambios mientras un correo se está enviando o hay un aviso pendiente', () => {
    expect(planReschedule({ ...base, announcementStatus: 'sending', oldStartsAt, newStartsAt: oldStartsAt }).ok).toBe(false)
    expect(planCancel({ ...base, hasPendingNotice: true }).ok).toBe(false)
    expect(planCancel({ ...base, reminder: { status: 'sending', scheduledAt: NOW } }).ok).toBe(false)
  })

  it('un borrador no se cancela y uno terminado no se toca', () => {
    expect(planCancel({ ...base, status: 'draft' }).ok).toBe(false)
    expect(planCancel({ ...base, endsAt: new Date(NOW.getTime() - H) }).ok).toBe(false)
  })

  it('cancelar tras el anuncio avisa y cancela el recordatorio pendiente', () => {
    expect(planCancel(base)).toEqual({ ok: true, notify: true, reminder: 'cancel' })
    expect(planCancel({ ...base, announcementStatus: 'pending' })).toEqual({ ok: true, notify: false, reminder: 'cancel' })
  })
})
