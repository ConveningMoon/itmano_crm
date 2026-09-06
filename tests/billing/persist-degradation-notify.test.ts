import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PaddleSubscriptionEvent } from '@/lib/paddle/reducer'

// Espejo de persist-reactivation-resilience.test.ts, pero para el aviso de
// ENTRADA al modo degradado (Task 16). Dos cosas se fijan aquí:
//   1. La condición detecta la TRANSICIÓN, no el estado: un tenant que YA
//      estaba degradado no debe volver a avisar en un evento posterior.
//   2. Un fallo de notifyDegradation NO puede tumbar el webhook — el estado de
//      facturación (subscriptions) ya quedó bien escrito y es lo que importa.
vi.mock('@/lib/subscriptions/notify-degradation', () => ({
  notifyDegradation: vi.fn(),
}))
// La reactivación no participa en estos escenarios (van hacia degradado, no
// hacia activo), pero persist.ts la importa incondicionalmente — se mockea
// para que el módulo cargue sin tocar Supabase real.
vi.mock('@/lib/subscriptions/reactivate', () => ({
  restoreAfterReactivation: vi.fn(),
}))

import { notifyDegradation } from '@/lib/subscriptions/notify-degradation'
import { applySubscriptionEvent } from '@/lib/paddle/persist'

const mockNotify = notifyDegradation as unknown as ReturnType<typeof vi.fn>

type Call = { method: string; args: unknown[] }

/**
 * Mismo fake mínimo que persist-reactivation-resilience.test.ts: solo las
 * formas de encadenado que applySubscriptionEvent ejecuta contra
 * `subscriptions` y `paddle_webhook_events`.
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

const degradingEvent: PaddleSubscriptionEvent = {
  eventId:          'evt_degradacion_1',
  eventType:        'subscription.updated',
  occurredAt:       '2026-11-01T00:00:00.000Z',
  subscriptionId:   'sub_1',
  customerId:       'ctm_1',
  status:           'canceled',
  priceId:          null,
  billingCycle:     null,
  currentPeriodEnd: null,
  cancelAt:         null,
  customData:       { tenant_id: 'tenant-x' },
}

// Snapshot ANTES del evento: activo, sin degradar todavía.
const activeSnapshotRow = {
  status:        'active',
  last_event_at: '2026-10-01T00:00:00.000Z',
  degraded_at:   null,
}

// Snapshot ANTES del evento: ya degradado (segundo evento del mismo ciclo).
const alreadyDegradedSnapshotRow = {
  status:        'cancelled',
  last_event_at: '2026-10-01T00:00:00.000Z',
  degraded_at:   '2026-09-01T00:00:00.000Z',
}

beforeEach(() => {
  mockCreateAdminClient.mockReset()
  mockNotify.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('applySubscriptionEvent — aviso de degradación', () => {
  it('se dispara en la TRANSICIÓN a degradado (no estaba degradado, este evento lo degrada)', async () => {
    const fake = makeFakeSupabase(activeSnapshotRow)
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)
    mockNotify.mockResolvedValue(undefined)

    const result = await applySubscriptionEvent(degradingEvent)

    expect(result).toBe('applied')
    expect(mockNotify).toHaveBeenCalledTimes(1)
    expect(mockNotify).toHaveBeenCalledWith('tenant-x', 'cancelled')
  })

  it('NO se dispara de nuevo si el tenant ya estaba degradado', async () => {
    const fake = makeFakeSupabase(alreadyDegradedSnapshotRow)
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    const result = await applySubscriptionEvent(degradingEvent)

    expect(result).toBe('applied')
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('un fallo en notifyDegradation NO impide que el evento se dé por aplicado', async () => {
    const fake = makeFakeSupabase(activeSnapshotRow)
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)
    mockNotify.mockRejectedValue(new Error('resend caído'))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await applySubscriptionEvent(degradingEvent)

    // Lo crítico: el webhook tiene éxito aunque el aviso haya fallado.
    expect(result).toBe('applied')
    expect(mockNotify).toHaveBeenCalledWith('tenant-x', 'cancelled')
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('paddle-degradation-notify'),
    )
    // El update de `subscriptions` (el estado de facturación) sí se ejecutó.
    const subsUpdate = fake.calls.find((c) => c.method === 'update(subscriptions)')
    expect(subsUpdate).toBeDefined()
  })
})
