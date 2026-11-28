import { describe, it, expect } from 'vitest'
import { overCapNoticeFor, overCapNoticeText, overCapUnpublishOn, planPublishCap, selectOverCapAction } from '@/lib/subscriptions/over-cap'

const now = new Date('2026-12-20T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()

describe('planPublishCap', () => {
  it('Esencial 0, Growth 50, Partner ilimitado', () => {
    expect(planPublishCap('esencial')).toBe(0)
    expect(planPublishCap('growth')).toBe(50)
    expect(planPublishCap('partner')).toBeNull()
  })
})

describe('selectOverCapAction', () => {
  it('mark: sobre el tope y sin marca', () => {
    expect(selectOverCapAction({ published: 51, cap: 50, overCapSince: null, now })).toBe('mark')
  })
  it('clear: dentro del tope con marca previa', () => {
    expect(selectOverCapAction({ published: 50, cap: 50, overCapSince: daysAgo(3), now })).toBe('clear')
  })
  it('wait: sobre el tope dentro de los 14 días', () => {
    expect(selectOverCapAction({ published: 60, cap: 50, overCapSince: daysAgo(13), now })).toBe('wait')
  })
  it('unpublish: exactamente 14 días o más', () => {
    expect(selectOverCapAction({ published: 60, cap: 50, overCapSince: daysAgo(14), now })).toBe('unpublish')
    expect(selectOverCapAction({ published: 60, cap: 50, overCapSince: daysAgo(30), now })).toBe('unpublish')
  })
  it('none: dentro del tope sin marca, o tope ilimitado', () => {
    expect(selectOverCapAction({ published: 10, cap: 50, overCapSince: null, now })).toBe('none')
    expect(selectOverCapAction({ published: 999, cap: null, overCapSince: null, now })).toBe('none')
  })
  it('tope ilimitado con marca vieja la limpia', () => {
    expect(selectOverCapAction({ published: 999, cap: null, overCapSince: daysAgo(5), now })).toBe('clear')
  })
  it('Esencial con una publicada se marca', () => {
    expect(selectOverCapAction({ published: 1, cap: 0, overCapSince: null, now })).toBe('mark')
  })
})

describe('aviso de despublicación', () => {
  it('la fecha es la marca + 14 días (UTC)', () => {
    expect(overCapUnpublishOn('2026-12-10T12:00:00.000Z')).toBe('2026-12-24T12:00:00.000Z')
    expect(overCapUnpublishOn(null)).toBeNull()
    expect(overCapUnpublishOn('basura')).toBeNull()
  })

  it('el texto lleva DD/MM, cuántas y el tope', () => {
    expect(overCapNoticeText({ unpublishOn: '2026-12-24T12:00:00.000Z', excess: 3, cap: 50 })).toBe(
      'El 24/12 se despublicarán las 3 propiedades más antiguas que superan tu plan (tope 50). Cambia de plan para conservarlas.',
    )
    expect(overCapNoticeText({ unpublishOn: '2027-01-05T00:00:00.000Z', excess: 1, cap: 50 })).toContain('El 05/01 se despublicará la propiedad más antigua')
  })

  it('overCapNoticeFor: sólo con fecha y uso sobre el tope', () => {
    const e = { unpublishOn: '2026-12-24T12:00:00.000Z', limit: 50, used: 53 }
    expect(overCapNoticeFor(e)).toContain('las 3 propiedades')
    expect(overCapNoticeFor({ ...e, used: 50 })).toBeNull()
    expect(overCapNoticeFor({ ...e, unpublishOn: null })).toBeNull()
    expect(overCapNoticeFor({ ...e, limit: null })).toBeNull()
  })
})
