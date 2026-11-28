import { describe, it, expect } from 'vitest'
import { degradedTransition } from '@/lib/subscriptions/transition'

const now = new Date('2026-12-20T12:00:00Z')

describe('degradedTransition', () => {
  it('expired -> active sale del modo degradado', () => {
    expect(degradedTransition({ status: 'expired' }, { status: 'active' }, now)).toBe('leave')
  })
  it('active -> paused entra', () => {
    expect(degradedTransition({ status: 'active' }, { status: 'paused' }, now)).toBe('enter')
  })
  it('trial vigente -> active no cambia', () => {
    expect(degradedTransition({ status: 'trial', trialEndsAt: '2026-12-25T00:00:00Z' }, { status: 'active' }, now)).toBeNull()
  })
  it('trial vencida (cron aun no corre) -> active sale', () => {
    expect(degradedTransition({ status: 'trial', trialEndsAt: '2026-12-19T00:00:00Z' }, { status: 'active' }, now)).toBe('leave')
  })
  it('cancelled -> expired sigue degradado', () => {
    expect(degradedTransition({ status: 'cancelled' }, { status: 'expired' }, now)).toBeNull()
  })
  it('extender una prueba vencida a futuro sale', () => {
    expect(degradedTransition(
      { status: 'trial', trialEndsAt: '2026-12-19T00:00:00Z' },
      { status: 'trial', trialEndsAt: '2027-01-10T00:00:00Z' }, now,
    )).toBe('leave')
  })
})

import { manualDegradedAt } from '@/lib/subscriptions/transition'

describe('manualDegradedAt', () => {
  const base = { nextStatus: 'expired' as const, storedDegradedAt: null, now }
  it('trial ya vencida (cron sin correr) guardada como expired ancla en el vencimiento', () => {
    expect(manualDegradedAt({
      ...base, transition: null,
      prev: { status: 'trial', trialEndsAt: '2026-12-19T00:00:00Z' },
    })).toBe('2026-12-19T00:00:00Z')
  })
  it('entrar desde activa ancla en ahora', () => {
    expect(manualDegradedAt({
      ...base, nextStatus: 'paused', transition: 'enter', prev: { status: 'active', trialEndsAt: null },
    })).toBe(now.toISOString())
  })
  it('degradado sin ancla y sin prueba previa ancla en ahora', () => {
    expect(manualDegradedAt({ ...base, transition: null, prev: null })).toBe(now.toISOString())
  })
  it('degradado con ancla existente no la toca', () => {
    expect(manualDegradedAt({
      ...base, transition: null, storedDegradedAt: '2026-12-01T00:00:00Z',
      prev: { status: 'expired', trialEndsAt: '2026-12-01T00:00:00Z' },
    })).toBeUndefined()
  })
  it('salir la limpia; un estado sano no la toca', () => {
    expect(manualDegradedAt({ ...base, nextStatus: 'active', transition: 'leave', prev: null })).toBeNull()
    expect(manualDegradedAt({ ...base, nextStatus: 'active', transition: null, prev: null })).toBeUndefined()
  })
})
