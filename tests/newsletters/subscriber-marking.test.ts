import { describe, it, expect } from 'vitest'
import type { createAdminClient } from '@/lib/supabase/admin'
import {
  shouldAssessFit, subscriberMetadata, mergeSubmissionMetadata, graduateSubscriber,
  hasSubscriberMark, newsletterConsent, withNewsletterConsent,
} from '@/lib/newsletters/subscriber'

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

  // Atribución de suscriptor a edición (hallazgo de la revisión): sin este
  // campo, getNewsletterStats/aggregateStats no tiene de dónde leer qué
  // edición captó al lector y el conteo por edición se queda en cero siempre.
  it('guarda edition_id cuando se le pasa', () => {
    const meta = subscriberMetadata({
      channelId: 'abc', consentText: 'Acepto.', sourceUrl: 'https://news.itmano.com/aj',
      editionId: 'edicion-1',
    })
    const sub = meta.newsletter_subscriber as Record<string, unknown>
    expect(sub.edition_id).toBe('edicion-1')
  })

  it('omite edition_id cuando no se le pasa — suscripción desde la portada', () => {
    const meta = subscriberMetadata({
      channelId: 'abc', consentText: 'Acepto.', sourceUrl: 'https://news.itmano.com/aj',
    })
    const sub = meta.newsletter_subscriber as Record<string, unknown>
    expect('edition_id' in sub).toBe(false)
  })

  it('también omite edition_id si llega null', () => {
    const meta = subscriberMetadata({
      channelId: 'abc', consentText: 'Acepto.', sourceUrl: 'https://news.itmano.com/aj', editionId: null,
    })
    const sub = meta.newsletter_subscriber as Record<string, unknown>
    expect('edition_id' in sub).toBe(false)
  })

  // La prueba va TAMBIÉN en su propia clave: graduateSubscriber borra
  // `newsletter_subscriber`, y si la prueba viviera sólo ahí dentro, graduar a
  // un lector destruiría el registro legal de su consentimiento.
  it('deja la prueba en una clave propia, fuera de la marca', () => {
    const meta = subscriberMetadata({
      channelId: 'abc', consentText: 'Acepto recibir comunicaciones.', sourceUrl: 'https://news.itmano.com/aj/mercado',
    })
    expect(meta.newsletter_consent).toMatchObject({
      text: 'Acepto recibir comunicaciones.',
      source_url: 'https://news.itmano.com/aj/mercado',
    })
    const sub = meta.newsletter_subscriber as Record<string, unknown>
    expect(meta.newsletter_consent).toEqual(sub.consent)
  })
})

describe('newsletterConsent / withNewsletterConsent', () => {
  it('guarda texto, url de origen y timestamp', () => {
    const proof = newsletterConsent({
      consentText: 'Acepto recibir el análisis mensual del mercado.',
      sourceUrl:   'https://news.itmano.com/aj/mercado',
      at:          '2026-08-24T10:00:00.000Z',
    })
    expect(proof).toEqual({
      text:       'Acepto recibir el análisis mensual del mercado.',
      source_url: 'https://news.itmano.com/aj/mercado',
      at:         '2026-08-24T10:00:00.000Z',
    })
  })

  it('pone el timestamp solo si el llamador no lo fija', () => {
    expect(typeof newsletterConsent({ consentText: 'x', sourceUrl: '' }).at).toBe('string')
  })

  // El caso que protege: un email que YA era lead se suscribe. No recibe la
  // marca de procedencia (un lead con historial no es sólo un lector), pero la
  // prueba del consentimiento sí tiene que quedar guardada — RGPD art. 7.1, y
  // no se puede añadir retroactivamente.
  it('un lead existente conserva su metadata y suma la prueba, SIN recibir la marca', () => {
    const existente = { intent: 'compra', budget_amount: 300000 }

    const merged = withNewsletterConsent(existente, {
      consentText: 'Acepto recibir comunicaciones.',
      sourceUrl:   'https://news.itmano.com/aj/mercado',
      at:          '2026-08-24T10:00:00.000Z',
    })

    expect(merged.intent).toBe('compra')
    expect(merged.budget_amount).toBe(300000)
    expect(merged.newsletter_consent).toEqual({
      text: 'Acepto recibir comunicaciones.',
      source_url: 'https://news.itmano.com/aj/mercado',
      at: '2026-08-24T10:00:00.000Z',
    })
    expect(hasSubscriberMark(merged)).toBe(false)
  })

  it('parte de un objeto vacío si el lead no tenía metadata', () => {
    const merged = withNewsletterConsent(null, { consentText: 'x', sourceUrl: 'https://n/a', at: 'ts' })
    expect(Object.keys(merged)).toEqual(['newsletter_consent'])
  })

  it('una segunda suscripción refresca la prueba en vez de duplicarla', () => {
    const primera = withNewsletterConsent(null, { consentText: 'v1', sourceUrl: 'u1', at: 't1' })
    const segunda = withNewsletterConsent(primera, { consentText: 'v2', sourceUrl: 'u2', at: 't2' })
    expect(segunda.newsletter_consent).toEqual({ text: 'v2', source_url: 'u2', at: 't2' })
  })
})

describe('hasSubscriberMark', () => {
  it('reconoce la marca de procedencia', () => {
    expect(hasSubscriberMark({ newsletter_subscriber: { at: 'x' } })).toBe(true)
  })

  it('la prueba de consentimiento por sí sola NO es la marca', () => {
    expect(hasSubscriberMark({ newsletter_consent: { text: 'x', source_url: '', at: 'y' } })).toBe(false)
  })

  it('tolera null y undefined', () => {
    expect(hasSubscriberMark(null)).toBe(false)
    expect(hasSubscriberMark(undefined)).toBe(false)
  })
})

describe('mergeSubmissionMetadata', () => {
  // Cubre el hallazgo: un lead NUEVO de canal newsletter no tiene fila previa
  // que leer (existingLead es null en el intake). Si esa misma sumisión trae
  // además un `intent` reconocido, `base` tiene que ser el metadata que YA se
  // insertó (con la marca incluida) — nunca `{}` a ciegas, o la fusión
  // borraría `newsletter_subscriber` en el mismo request que lo creó.
  it('el metadata insertado para un suscriptor nuevo sobrevive a un intent reconocido en el mismo envio', () => {
    const inserted = subscriberMetadata({
      channelId: 'abc', consentText: 'Acepto recibir comunicaciones.', sourceUrl: 'https://news.itmano.com/aj/mercado',
    })

    const merged = mergeSubmissionMetadata(inserted, { intent: 'compra', budgetAmount: null })

    expect(merged.newsletter_subscriber).toEqual(inserted.newsletter_subscriber)
    expect(merged.intent).toBe('compra')
  })

  it('parte de un objeto vacio si no hay base', () => {
    expect(mergeSubmissionMetadata(null, { intent: 'venta', budgetAmount: null })).toEqual({ intent: 'venta' })
  })

  it('no agrega intent ni budget_amount si el envio no trajo ninguno', () => {
    expect(mergeSubmissionMetadata({ a: 1 }, {})).toEqual({ a: 1 })
  })

  it('agrega budget_amount cuando el envio lo trae', () => {
    expect(mergeSubmissionMetadata({}, { budgetAmount: 300000 })).toEqual({ budget_amount: 300000 })
  })
})

describe('graduateSubscriber', () => {
  // Fake mínimo del cliente admin: sólo las formas de encadenado que
  // graduateSubscriber ejecuta contra `leads` (select().eq().maybeSingle() y
  // update().eq()). Mismo patrón que tests/billing/persist-degradation-notify.test.ts.
  function makeFakeLeadsDb(metadata: Record<string, unknown> | null) {
    const calls: { method: string; args: unknown[] }[] = []
    const client = {
      from(table: string) {
        calls.push({ method: 'from', args: [table] })
        return {
          select(cols: string) {
            calls.push({ method: 'select', args: [cols] })
            return {
              eq(col: string, val: unknown) {
                calls.push({ method: 'eq(select)', args: [col, val] })
                return {
                  maybeSingle: () => {
                    calls.push({ method: 'maybeSingle', args: [] })
                    return Promise.resolve({ data: { metadata }, error: null })
                  },
                }
              },
            }
          },
          update(payload: Record<string, unknown>) {
            calls.push({ method: 'update', args: [payload] })
            return {
              eq(col: string, val: unknown) {
                calls.push({ method: 'eq(update)', args: [col, val] })
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      },
    }
    return { calls, client: client as unknown as ReturnType<typeof createAdminClient> }
  }

  it('quita solo la marca y conserva el resto del metadata', async () => {
    const fake = makeFakeLeadsDb({ newsletter_subscriber: { at: 'x' }, intent: 'compra' })

    await graduateSubscriber(fake.client, 'lead-1')

    const update = fake.calls.find(c => c.method === 'update')
    expect(update).toBeDefined()
    expect(update?.args[0]).toEqual({ metadata: { intent: 'compra' } })
  })

  it('conserva la prueba del consentimiento: graduarse no revoca lo consentido', async () => {
    const consent = { text: 'Acepto recibir comunicaciones.', source_url: 'https://n/a', at: 'ts' }
    const fake = makeFakeLeadsDb({ newsletter_subscriber: { at: 'x' }, newsletter_consent: consent })

    await graduateSubscriber(fake.client, 'lead-4')

    const update = fake.calls.find(c => c.method === 'update')
    expect(update?.args[0]).toEqual({ metadata: { newsletter_consent: consent } })
  })

  it('es idempotente: no escribe nada si el lead no tiene la marca', async () => {
    const fake = makeFakeLeadsDb({ intent: 'compra' })

    await graduateSubscriber(fake.client, 'lead-2')

    expect(fake.calls.find(c => c.method === 'update')).toBeUndefined()
  })

  it('no revienta ni escribe si el lead no tiene metadata', async () => {
    const fake = makeFakeLeadsDb(null)

    await expect(graduateSubscriber(fake.client, 'lead-3')).resolves.toBeUndefined()
    expect(fake.calls.find(c => c.method === 'update')).toBeUndefined()
  })
})
