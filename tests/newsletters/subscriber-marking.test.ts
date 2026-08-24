import { describe, it, expect } from 'vitest'
import type { createAdminClient } from '@/lib/supabase/admin'
import {
  shouldAssessFit, subscriberMetadata, mergeSubmissionMetadata, graduateSubscriber,
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
