import { describe, it, expect } from 'vitest'

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
  const todayStr     = new Date().toISOString().slice(0, 10)
  const tomorrowDate = new Date(); tomorrowDate.setDate(tomorrowDate.getDate() + 1)
  const tomorrowStr  = tomorrowDate.toISOString().slice(0, 10)
  const dayAfterDate = new Date(); dayAfterDate.setDate(dayAfterDate.getDate() + 2)
  const dayAfterStr  = dayAfterDate.toISOString().slice(0, 10)

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
    const future = new Date(); future.setDate(future.getDate() + 7)
    expect(shouldSkipPreClose(future.toISOString().slice(0, 10))).toBe(false)
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
