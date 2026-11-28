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
