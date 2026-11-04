import { describe, it, expect, vi } from 'vitest'
import {
  BOUNCE_GUARD_MIN_LEADS, broadcastGuardReason, broadcastQuotaError, canCancelBroadcast, canResumeBroadcast,
} from '@/lib/broadcasts/model'
import {
  EMPTY_SEGMENT, hasAudienceCriteria, parseBroadcastAudience, segmentFromLeadFilters,
} from '@/lib/broadcasts/audience'
import { parseLeadListFilters } from '@/lib/leads/list-filters'
import { batchIdempotencyKey, isRateLimit, sendPermissiveBatch } from '@/lib/email/batch-send'

describe('hasAudienceCriteria', () => {
  it('sin criterios no selecciona a nadie: nunca "todos los leads"', () => {
    expect(hasAudienceCriteria(EMPTY_SEGMENT)).toBe(false)
    expect(hasAudienceCriteria({ mode: 'manual', leadIds: [] })).toBe(false)
  })

  it('excluir o quitar importados no acota por sí solo', () => {
    expect(hasAudienceCriteria({ ...EMPTY_SEGMENT, excludeImported: true, excludedLeadIds: ['a'] })).toBe(false)
  })

  it('cualquier criterio cuenta', () => {
    expect(hasAudienceCriteria({ ...EMPTY_SEGMENT, stages: ['nuevo'] })).toBe(true)
    expect(hasAudienceCriteria({ ...EMPTY_SEGMENT, language: 'es' })).toBe(true)
    expect(hasAudienceCriteria({ mode: 'manual', leadIds: ['a'] })).toBe(true)
  })
})

describe('parseBroadcastAudience', () => {
  it('lo que no valida cae a una audiencia vacía, no a todos', () => {
    expect(hasAudienceCriteria(parseBroadcastAudience({ mode: 'otro' }))).toBe(false)
    expect(hasAudienceCriteria(parseBroadcastAudience(null))).toBe(false)
  })

  it('completa los valores por defecto', () => {
    expect(parseBroadcastAudience({ mode: 'segment', stages: ['nuevo'] })).toEqual({ ...EMPTY_SEGMENT, stages: ['nuevo'] })
  })
})

describe('segmentFromLeadFilters', () => {
  const tags = [{ id: '11111111-1111-4111-8111-111111111111', slug: 'pre-aprobado' }]

  it('traduce los filtros de /leads, con la etiqueta como id', () => {
    const filters = parseLeadListFilters({ stage: 'nuevo', tag: 'pre-aprobado', lang: 'en', q: 'ana' })
    expect(segmentFromLeadFilters(filters, tags as never)).toEqual({
      ...EMPTY_SEGMENT, stages: ['nuevo'], tagIds: [tags[0].id], language: 'en', q: 'ana',
    })
  })

  it('una etapa desconocida no se convierte en criterio', () => {
    const filters = parseLeadListFilters({ stage: 'inventada' })
    expect(segmentFromLeadFilters(filters, tags as never).stages).toEqual([])
  })
})

describe('broadcastGuardReason', () => {
  it('una sola queja de spam pausa', () => {
    expect(broadcastGuardReason({ leads: 500, bounced: 0, complained: 1 })).toMatch(/spam/)
  })

  it('un rebote aislado en una muestra chica no dice nada de la lista', () => {
    expect(broadcastGuardReason({ leads: BOUNCE_GUARD_MIN_LEADS - 1, bounced: 5, complained: 0 })).toBeNull()
  })

  it('pausa sólo por encima del 5%', () => {
    expect(broadcastGuardReason({ leads: 100, bounced: 5, complained: 0 })).toBeNull()
    expect(broadcastGuardReason({ leads: 100, bounced: 6, complained: 0 })).toMatch(/rebotaron 6 de 100/)
  })
})

describe('broadcastQuotaError', () => {
  it('el envío cabe entero o no sale', () => {
    expect(broadcastQuotaError({ limit: 3000, used: 2000 }, 1000)).toBeNull()
    expect(broadcastQuotaError({ limit: 3000, used: 2000 }, 1001)).toMatch(/quedan 1000 de 3000/)
  })

  it('un cupo ya pasado no da un número negativo', () => {
    expect(broadcastQuotaError({ limit: 100, used: 150 }, 1)).toMatch(/quedan 0 de 100/)
  })
})

describe('transiciones', () => {
  it('lo terminado no se cancela ni se reanuda', () => {
    expect(canCancelBroadcast('sent')).toBe(false)
    expect(canCancelBroadcast('draft')).toBe(false)
    expect(canCancelBroadcast('sending')).toBe(true)
    expect(canResumeBroadcast('paused')).toBe(true)
    expect(canResumeBroadcast('failed')).toBe(true)
    expect(canResumeBroadcast('cancelled')).toBe(false)
  })
})

describe('batch-send', () => {
  const items = [
    { leadId: 'a', payload: { to: 'a@example.com' } },
    { leadId: 'b', payload: { to: 'b@example.com' } },
    { leadId: 'c', payload: { to: 'c@example.com' } },
  ]
  const clientWith = (res: unknown) => ({ batch: { send: vi.fn(async () => res) } }) as never

  it('la clave no depende del orden y cambia con los leads', () => {
    expect(batchIdempotencyKey('p', ['a', 'b'])).toBe(batchIdempotencyKey('p', ['b', 'a']))
    expect(batchIdempotencyKey('p', ['a', 'b'])).not.toBe(batchIdempotencyKey('p', ['a', 'c']))
  })

  it('reconoce el 429 por código y por nombre', () => {
    expect(isRateLimit({ statusCode: 429 })).toBe(true)
    expect(isRateLimit({ name: 'rate_limit_exceeded' })).toBe(true)
    expect(isRateLimit({ statusCode: 422, message: 'invalid' })).toBe(false)
    expect(isRateLimit(null)).toBe(false)
  })

  it('en modo permisivo empareja los ids saltando los que fallaron', async () => {
    const res = await sendPermissiveBatch(clientWith({
      data: { data: [{ id: 'id-a' }, { id: 'id-c' }], errors: [{ index: 1, message: 'correo inválido' }] },
      error: null,
    }), items, 'k')
    expect(res.sent.map(s => [s.item.leadId, s.id])).toEqual([['a', 'id-a'], ['c', 'id-c']])
    expect(res.failed).toEqual([{ leadId: 'b', error: 'correo inválido' }])
  })

  it('un 429 no marca a nadie como fallido', async () => {
    const res = await sendPermissiveBatch(clientWith({ data: null, error: { statusCode: 429, message: 'Too many' } }), items, 'k')
    expect(res).toEqual({ rateLimited: true, sent: [], failed: [] })
  })

  it('otro error marca al lote entero para reintento', async () => {
    const res = await sendPermissiveBatch(clientWith({ data: null, error: { statusCode: 500, message: 'caído' } }), items, 'k')
    expect(res.rateLimited).toBe(false)
    expect(res.failed.map(f => f.leadId)).toEqual(['a', 'b', 'c'])
  })
})
