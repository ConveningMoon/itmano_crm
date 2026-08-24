import { describe, it, expect } from 'vitest'
import { shouldAssessFit, subscriberMetadata } from '@/lib/newsletters/subscriber'

describe('shouldAssessFit', () => {
  it('no gasta IA en una suscripcion a newsletter', () => {
    expect(shouldAssessFit('newsletter', null)).toBe(false)
    expect(shouldAssessFit('newsletter', {})).toBe(false)
  })

  it('tampoco gasta IA en un formulario que no recogio ninguna dimension', () => {
    expect(shouldAssessFit('lead_magnet', {})).toBe(false)
    expect(shouldAssessFit('lead_magnet', null)).toBe(false)
  })

  it('si gasta IA cuando hay fit real', () => {
    expect(shouldAssessFit('lead_magnet', { timeline: 'under_3_months' })).toBe(true)
    expect(shouldAssessFit('contact_form', { financing: 'cash' })).toBe(true)
  })

  it('una suscripcion con fit real tampoco analiza: el canal manda', () => {
    expect(shouldAssessFit('newsletter', { timeline: 'under_3_months' })).toBe(false)
  })
})

describe('subscriberMetadata', () => {
  it('guarda la prueba del consentimiento', () => {
    const meta = subscriberMetadata({
      channelId: 'abc', consentText: 'Acepto recibir comunicaciones.', sourceUrl: 'https://news.itmano.com/aj/mercado',
    })
    const sub = meta.newsletter_subscriber as Record<string, unknown>
    expect(sub.channel_id).toBe('abc')
    expect(sub.consent).toMatchObject({
      text: 'Acepto recibir comunicaciones.',
      source_url: 'https://news.itmano.com/aj/mercado',
    })
    expect(typeof (sub.consent as Record<string, unknown>).at).toBe('string')
    expect(typeof sub.at).toBe('string')
  })
})
