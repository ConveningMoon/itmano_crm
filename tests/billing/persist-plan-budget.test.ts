import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { PaddleSubscriptionEvent } from '@/lib/paddle/reducer'
import { PLANS } from '@/lib/plans'

// Al cambiar de plan, el presupuesto mensual de IA del tenant se mueve al del
// plan nuevo. Lo que estos tests fijan no es tanto que se mueva —eso es una
// linea— sino CUANDO NO se mueve: solo en la transicion, nunca en cada evento.
// Un `subscription.updated` de renovacion trae el mismo plan, y reescribir en
// cada uno pisaria el tope que el super_admin ajusto a mano para ese cliente.

vi.mock('@/lib/subscriptions/reactivate', () => ({
  restoreAfterReactivation: vi.fn(),
}))
vi.mock('@/lib/subscriptions/notify-degradation', () => ({
  notifyDegradation: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { applySubscriptionEvent } from '@/lib/paddle/persist'

const mockCreateAdminClient = createAdminClient as unknown as ReturnType<typeof vi.fn>

/**
 * Fake del cliente de Supabase con las tres tablas que toca este flujo. Mismo
 * enfoque que los otros fakes de persist: no es un mock generico, es la forma
 * exacta de encadenado que ejecuta el modulo.
 */
function makeFakeSupabase(
  subscriptionRow: Record<string, unknown>,
  opts: { tenantUpdateError?: string } = {},
) {
  const tenantUpdates: unknown[] = []
  const client = {
    from(table: string) {
      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: subscriptionRow, error: null }) }),
          }),
          update: () => ({
            eq: (_col: string, val: unknown) => ({
              select: () => Promise.resolve({ data: [{ tenant_id: val }], error: null }),
            }),
          }),
        }
      }
      if (table === 'tenants') {
        return {
          update(payload: unknown) {
            tenantUpdates.push(payload)
            return {
              eq: () => Promise.resolve({
                data: null,
                error: opts.tenantUpdateError ? { message: opts.tenantUpdateError } : null,
              }),
            }
          },
        }
      }
      if (table === 'paddle_webhook_events') {
        return { update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }) }
      }
      throw new Error(`tabla no mockeada en este fake: ${table}`)
    },
  }
  return { tenantUpdates, client }
}

function eventoConPlan(plan: string | undefined): PaddleSubscriptionEvent {
  return {
    eventId:          'evt_plan_1',
    eventType:        'subscription.updated',
    occurredAt:       '2026-11-01T00:00:00.000Z',
    subscriptionId:   'sub_1',
    customerId:       'ctm_1',
    status:           'active',
    priceId:          null,
    billingCycle:     null,
    currentPeriodEnd: null,
    cancelAt:         null,
    customData:       plan ? { tenant_id: 'tenant-x', plan } : { tenant_id: 'tenant-x' },
  }
}

// Activo, con un last_event_at anterior para que el reductor no lo descarte.
const filaEsencial = {
  status:        'active',
  last_event_at: '2026-10-01T00:00:00.000Z',
  degraded_at:   null,
  plan:          'esencial',
}

beforeEach(() => { mockCreateAdminClient.mockReset() })
afterEach(() => { vi.restoreAllMocks() })

describe('applySubscriptionEvent — el presupuesto sigue al plan', () => {
  it('al subir de Esencial a Growth escribe el presupuesto de Growth', async () => {
    const fake = makeFakeSupabase(filaEsencial)
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    const result = await applySubscriptionEvent(eventoConPlan('growth'))

    expect(result).toBe('applied')
    expect(fake.tenantUpdates).toEqual([
      { ai_monthly_limit_usd: PLANS.growth.limits.aiBudgetUsd },
    ])
  })

  it('al bajar de Growth a Esencial escribe el de Esencial', async () => {
    const fake = makeFakeSupabase({ ...filaEsencial, plan: 'growth' })
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    await applySubscriptionEvent(eventoConPlan('esencial'))

    expect(fake.tenantUpdates).toEqual([
      { ai_monthly_limit_usd: PLANS.esencial.limits.aiBudgetUsd },
    ])
  })

  // El caso que protege el ajuste manual del super_admin.
  it('un evento con el MISMO plan no toca el presupuesto', async () => {
    const fake = makeFakeSupabase(filaEsencial)
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    const result = await applySubscriptionEvent(eventoConPlan('esencial'))

    expect(result).toBe('applied')
    expect(fake.tenantUpdates).toEqual([])
  })

  it('un evento sin plan en custom_data no toca el presupuesto', async () => {
    const fake = makeFakeSupabase(filaEsencial)
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    const result = await applySubscriptionEvent(eventoConPlan(undefined))

    expect(result).toBe('applied')
    expect(fake.tenantUpdates).toEqual([])
  })

  // Mismo criterio que la reactivacion: lo critico (el estado de facturacion)
  // ya se escribio, y un 500 haria que Paddle reintente un evento que el
  // reductor descartara por viejo — el reintento no arreglaria nada.
  it('si falla el update del presupuesto, el evento igual se da por aplicado', async () => {
    const fake = makeFakeSupabase(filaEsencial, { tenantUpdateError: 'timeout transitorio' })
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const result = await applySubscriptionEvent(eventoConPlan('partner'))

    expect(result).toBe('applied')
    // El log es la UNICA señal de que el tenant quedo con el presupuesto viejo.
    expect(errorSpy).toHaveBeenCalled()
    expect(errorSpy.mock.calls.some(c => String(c[0]).includes('paddle-plan-budget'))).toBe(true)
  })
})
