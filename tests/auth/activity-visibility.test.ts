import { describe, it, expect } from 'vitest'
import { isEventVisibleToViewer } from '@/lib/activity/visibility'
import { authorOf, SYSTEM_AUTHOR } from '@/lib/data/activity-authors'

const ME = 'user-me'
const OTHER = 'user-other'

describe('isEventVisibleToViewer — role × actor matrix', () => {
  it('agent sees system events (actor null)', () => {
    expect(isEventVisibleToViewer({ role: 'agent', userId: ME }, null)).toBe(true)
  })
  it('agent sees their OWN events', () => {
    expect(isEventVisibleToViewer({ role: 'agent', userId: ME }, ME)).toBe(true)
  })
  it('agent does NOT see events authored by another human', () => {
    expect(isEventVisibleToViewer({ role: 'agent', userId: ME }, OTHER)).toBe(false)
  })
  it('agent_owner sees everything (own, others, system)', () => {
    const v = { role: 'agent_owner' as const, userId: ME }
    expect(isEventVisibleToViewer(v, null)).toBe(true)
    expect(isEventVisibleToViewer(v, ME)).toBe(true)
    expect(isEventVisibleToViewer(v, OTHER)).toBe(true)
  })
  it('super_admin sees everything', () => {
    const v = { role: 'super_admin' as const, userId: ME }
    expect(isEventVisibleToViewer(v, null)).toBe(true)
    expect(isEventVisibleToViewer(v, OTHER)).toBe(true)
  })
})

describe('authorOf — display resolution', () => {
  const names = { 'u1': 'Adriana Melendez', 'u2': 'owner@itmano.com' }
  it('null actor → Sistema', () => {
    expect(authorOf(null, names)).toBe(SYSTEM_AUTHOR)
  })
  it('linked agent / known id → its resolved name', () => {
    expect(authorOf('u1', names)).toBe('Adriana Melendez')
    expect(authorOf('u2', names)).toBe('owner@itmano.com')
  })
  it('unknown id → generic fallback', () => {
    expect(authorOf('u3', names)).toBe('Usuario')
  })
})
