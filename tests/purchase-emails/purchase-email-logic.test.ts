import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// ─── Pure logic extracted for unit testing ────────────────────────────────────
// These functions mirror the logic in send-purchase-email.ts without importing
// the server-only module (which requires Resend / Supabase at import time).

function isPlaceholder(id: string): boolean {
  return !id || id.startsWith('REPLACE_ME')
}

function shouldSkipPreClose(closingDate: string | null): boolean {
  if (!closingDate) return true
  const closing  = new Date(closingDate + 'T00:00:00')
  const tomorrow = new Date(); tomorrow.setHours(0, 0, 0, 0); tomorrow.setDate(tomorrow.getDate() + 1)
  return closing <= tomorrow
}

function resolveLanguage(lang: string | null | undefined): 'es' | 'en' | 'pt' {
  return (['es', 'en', 'pt'].includes(lang ?? '') ? lang : 'es') as 'es' | 'en' | 'pt'
}

// ─── Template placeholder detection ──────────────────────────────────────────

describe('isPlaceholder', () => {
  it('flags seed placeholders as placeholder', () => {
    expect(isPlaceholder('REPLACE_ME_start_es')).toBe(true)
    expect(isPlaceholder('REPLACE_ME_pre_close_en')).toBe(true)
    expect(isPlaceholder('REPLACE_ME_completed_pt')).toBe(true)
  })

  it('flags empty string as placeholder', () => {
    expect(isPlaceholder('')).toBe(true)
  })

  it('treats a real Resend template id as valid', () => {
    expect(isPlaceholder('d-abc123')).toBe(false)
    expect(isPlaceholder('550e8400-e29b-41d4-a716-446655440000')).toBe(false)
  })
})

// ─── Pre-close skip edge case ─────────────────────────────────────────────────

describe('shouldSkipPreClose — edge case closing_date <= tomorrow', () => {
  // shouldSkipPreClose razona SIEMPRE en hora local: parsea 'YYYY-MM-DD' como
  // medianoche local y la compara con el mañana local. En Vercel eso es UTC, así
  // que en producción da igual — pero un test que arme sus fechas con
  // `toISOString()` (que es UTC) pregunta por un día distinto del que dice.
  //
  // Con un offset positivo y el reloj pasada la medianoche, "pasado mañana"
  // local se serializaba como "mañana" UTC y el caso de no-saltar recibía el
  // borde contrario: el bloque pasaba o fallaba según a qué hora se corriera.
  //
  // Se corrige por los dos lados: reloj congelado (nada depende de cuándo se
  // ejecute, ni de cruzar la medianoche a mitad de corrida) y fechas armadas en
  // hora local, el mismo reloj que usa la función bajo prueba.
  const NOW = new Date(2026, 7, 15, 12, 0, 0) // 15-ago-2026, mediodía local

  beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
  afterAll(() => { vi.useRealTimers() })

  function localDateStr(offsetDays: number): string {
    const d = new Date(NOW)
    d.setDate(d.getDate() + offsetDays)
    const pad = (v: number) => String(v).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  const todayStr    = localDateStr(0)
  const tomorrowStr = localDateStr(1)
  const dayAfterStr = localDateStr(2)

  it('skips when closingDate is null', () => {
    expect(shouldSkipPreClose(null)).toBe(true)
  })

  it('skips when closingDate is today', () => {
    expect(shouldSkipPreClose(todayStr)).toBe(true)
  })

  it('skips when closingDate is tomorrow (cron fires exactly 1 day before)', () => {
    expect(shouldSkipPreClose(tomorrowStr)).toBe(true)
  })

  it('does NOT skip when closingDate is the day after tomorrow', () => {
    expect(shouldSkipPreClose(dayAfterStr)).toBe(false)
  })

  it('does NOT skip when closingDate is a week away', () => {
    expect(shouldSkipPreClose(localDateStr(7))).toBe(false)
  })

  // El borde vive entre +1 y +2 días: si alguien cambia el `<=` por `<`, o el
  // parseo de la fecha se va a UTC, uno de estos dos deja de cumplirse.
  it('el corte esta exactamente entre manana y pasado manana', () => {
    expect(shouldSkipPreClose(tomorrowStr)).toBe(true)
    expect(shouldSkipPreClose(dayAfterStr)).toBe(false)
  })

  it('ayer tambien se salta', () => {
    expect(shouldSkipPreClose(localDateStr(-1))).toBe(true)
  })
})

// ─── Language resolution ──────────────────────────────────────────────────────

describe('resolveLanguage — fallback to es for invalid values', () => {
  it('returns valid language values as-is', () => {
    expect(resolveLanguage('es')).toBe('es')
    expect(resolveLanguage('en')).toBe('en')
    expect(resolveLanguage('pt')).toBe('pt')
  })

  it('falls back to es for null / undefined / unknown values', () => {
    expect(resolveLanguage(null)).toBe('es')
    expect(resolveLanguage(undefined)).toBe('es')
    expect(resolveLanguage('fr')).toBe('es')
    expect(resolveLanguage('')).toBe('es')
  })
})

// ─── Idempotency flag mapping ─────────────────────────────────────────────────

describe('SENT_FLAG mapping — one flag per milestone', () => {
  const SENT_FLAG: Record<string, string> = {
    start:     'email_start_sent',
    pre_close: 'email_preclose_sent',
    completed: 'email_completed_sent',
  }

  it('maps all 3 milestones to distinct flags', () => {
    expect(SENT_FLAG['start']).toBe('email_start_sent')
    expect(SENT_FLAG['pre_close']).toBe('email_preclose_sent')
    expect(SENT_FLAG['completed']).toBe('email_completed_sent')
  })

  it('has no overlap between flag column names', () => {
    const values = Object.values(SENT_FLAG)
    expect(new Set(values).size).toBe(values.length)
  })
})
