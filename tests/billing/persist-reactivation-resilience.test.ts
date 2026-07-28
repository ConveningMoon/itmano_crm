import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PaddleSubscriptionEvent } from '@/lib/paddle/reducer'

// Fija el comportamiento decidido tras el escenario completo: si
// restoreAfterReactivation lanza, el evento de Paddle NO debe fallar. El
// estado de facturación (subscriptions) ya quedó bien escrito antes de este
// punto — devolver 500 no lo arregla y además es contraproducente: en el
// reintento el reductor descartaría el mismo evento por `occurred_at <=
// last_event_at` y la restauración jamás volvería a intentarse. Sin este
// test, alguien podría "arreglar" el try/catch relanzando el error y
// reintroducir el bug en sentido contrario.
vi.mock('@/lib/subscriptions/reactivate', () => ({
  restoreAfterReactivation: vi.fn(),
}))

import { restoreAfterReactivation } from '@/lib/subscriptions/reactivate'
import { applySubscriptionEvent } from '@/lib/paddle/persist'

const mockRestore = restoreAfterReactivation as unknown as ReturnType<typeof vi.fn>

type Call = { method: string; args: unknown[] }

/**
 * Fake mínimo del cliente de Supabase usado por applySubscriptionEvent: solo
 * las tres formas de encadenado que el módulo realmente ejecuta contra
 * `subscriptions` (lectura y update) y `paddle_webhook_events` (update). No
 * es un mock genérico de Supabase — es la forma exacta de este archivo.
 */
function makeFakeSupabase(subscriptionRow: Record<string, unknown>) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      calls.push({ method: 'from', args: [table] })
      if (table === 'subscriptions') {
        return {
          select(cols: string) {
            calls.push({ method: 'select', args: [cols] })
            return {
              eq(col: string, val: unknown) {
                calls.push({ method: 'eq(select)', args: [col, val] })
                return {
                  maybeSingle: () => {
                    calls.push({ method: 'maybeSingle', args: [] })
                    return Promise.resolve({ data: subscriptionRow, error: null })
                  },
                }
              },
            }
          },
          update(payload: unknown) {
            calls.push({ method: 'update(subscriptions)', args: [payload] })
            return {
              eq(col: string, val: unknown) {
                calls.push({ method: 'eq(update)', args: [col, val] })
                return {
                  select: (cols: string) => {
                    calls.push({ method: 'select(update)', args: [cols] })
                    return Promise.resolve({ data: [{ tenant_id: val }], error: null })
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'paddle_webhook_events') {
        return {
          update(payload: unknown) {
            calls.push({ method: 'update(webhook_events)', args: [payload] })
            return {
              eq: (col: string, val: unknown) => {
                calls.push({ method: 'eq(webhook_events)', args: [col, val] })
                return Promise.resolve({ data: null, error: null })
              },
            }
          },
        }
      }
      throw new Error(`tabla no mockeada en este fake: ${table}`)
    },
  }
  return { calls, client }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
import { createAdminClient } from '@/lib/supabase/admin'
const mockCreateAdminClient = createAdminClient as unknown as ReturnType<typeof vi.fn>

const reactivationEvent: PaddleSubscriptionEvent = {
  eventId:          'evt_reactivacion_1',
  eventType:        'subscription.updated',
  occurredAt:       '2026-11-01T00:00:00.000Z',
  subscriptionId:   'sub_1',
  customerId:       'ctm_1',
  status:           'active',
  priceId:          null,
  billingCycle:     null,
  currentPeriodEnd: null,
  cancelAt:         null,
  // Se fija tenant_id en custom_data para que resolveTenantId no necesite
  // pegarle a la base — no es lo que se está probando aquí.
  customData:       { tenant_id: 'tenant-x' },
}

// Snapshot ANTES del evento: degradado, con un last_event_at anterior al
// occurredAt de arriba (para que el reductor no lo descarte por viejo).
const degradedSnapshotRow = {
  status:        'cancelled',
  last_event_at: '2026-10-01T00:00:00.000Z',
  degraded_at:   '2026-09-01T00:00:00.000Z',
}

beforeEach(() => {
  mockCreateAdminClient.mockReset()
  mockRestore.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applySubscriptionEvent — resiliencia de la reactivación', () => {
  it('un fallo en restoreAfterReactivation NO impide que el evento se de por aplicado', async () => {
    const fake = makeFakeSupabase(degradedSnapshotRow)
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)
    mockRestore.mockRejectedValue(new Error('timeout transitorio de Supabase'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await applySubscriptionEvent(reactivationEvent)

    // Lo crítico: el webhook tiene éxito aunque la restauración haya fallado.
    expect(result).toBe('applied')
    // La restauración sí se intentó (la transición se detectó correctamente).
    expect(mockRestore).toHaveBeenCalledWith('tenant-x')
    // El fallo queda registrado de forma inequívoca — es la única señal de
    // que este cliente quedó con propiedades aún despublicadas.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('paddle-reactivation'),
    )
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('tenant-x'),
    )
    // El update de `subscriptions` (el estado de facturación) sí se ejecutó
    // ANTES de que la restauración fallara — no quedó a medias por el error.
    const subsUpdate = fake.calls.find((c) => c.method === 'update(subscriptions)')
    expect(subsUpdate).toBeDefined()
  })

  it('si la restauración funciona, no hay log de error', async () => {
    const fake = makeFakeSupabase(degradedSnapshotRow)
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)
    mockRestore.mockResolvedValue({ propertiesRepublished: 2 })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await applySubscriptionEvent(reactivationEvent)

    expect(result).toBe('applied')
    expect(mockRestore).toHaveBeenCalledWith('tenant-x')
    expect(errorSpy).not.toHaveBeenCalled()
  })
})
