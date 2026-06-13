import { describe, it, expect } from 'vitest'
import { bandForScore, averageLiveTemperature } from '@/lib/scoring/temperature-band'

describe('bandForScore — labelled bands', () => {
  it('maps the four bands at their boundaries', () => {
    expect(bandForScore(60).label).toBe('Caliente')
    expect(bandForScore(100).label).toBe('Caliente')
    expect(bandForScore(59).label).toBe('Templado')
    expect(bandForScore(35).label).toBe('Templado')
    expect(bandForScore(34).label).toBe('Nurturing')
    expect(bandForScore(15).label).toBe('Nurturing')
    expect(bandForScore(14).label).toBe('Nuevo')
    expect(bandForScore(0).label).toBe('Nuevo')
  })
})

describe('averageLiveTemperature — excludes frozen leads', () => {
  it('averages over live leads only (frozen statuses dropped)', () => {
    const leads = [
      { status: 'new',               temperatureScore: 20 },
      { status: 'warm',              temperatureScore: 40 },
      { status: 'closed',            temperatureScore: 100 }, // frozen → excluded
      { status: 'process_completed', temperatureScore: 100 }, // frozen → excluded
      { status: 'lost',              temperatureScore: 0   }, // frozen → excluded
      { status: 'process_started',   temperatureScore: 90  }, // frozen → excluded
    ]
    // Live: 20 + 40 = 60 / 2 = 30 → "Nuevo"? 30 is Nurturing band.
    expect(averageLiveTemperature(leads)).toBe(30)
    expect(bandForScore(averageLiveTemperature(leads)!).label).toBe('Nurturing')
  })

  it('null score counts as 0 in the average', () => {
    const leads = [
      { status: 'new', temperatureScore: null },
      { status: 'hot', temperatureScore: 80 },
    ]
    expect(averageLiveTemperature(leads)).toBe(40) // (0 + 80) / 2
  })

  it('returns null when there are no live leads', () => {
    const leads = [
      { status: 'closed', temperatureScore: 100 },
      { status: 'lost',   temperatureScore: 0 },
    ]
    expect(averageLiveTemperature(leads)).toBeNull()
  })

  it('returns null for an empty scope', () => {
    expect(averageLiveTemperature([])).toBeNull()
  })
})
