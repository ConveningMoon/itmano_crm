import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TenantContext } from '@/lib/auth/tenant-context'
import { PLANS, TRIAL } from '@/lib/plans'

// updateTenantSubscription (Centro de control) sincroniza el presupuesto de IA
// al plan nuevo, igual que paddle/persist.ts — pero con una excepción que
// persist.ts no necesita: un tenant en PRUEBA vive como `plan = 'growth'` con
// presupuesto de CORTESÍA (`TRIAL.aiBudgetUsd`), no el de Growth de pago. El
// formulario del Centro de control manda el estado completo en cada guardado
// (admin-client.tsx), así que sin la guardia de `status !== 'trial'` cualquier
// edición de un tenant en prueba —el nombre, el logo, lo que sea— dispararía
// esta sincronización y le pisaría los $25 de cortesía por los $30 de Growth
// de pago. Estos tests fijan esa guardia, más el caso sano que sí debe
// sincronizar: un cambio de plan real entre planes de pago.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/auth/tenant-context', () => ({
  getCurrentTenantContext: vi.fn(),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateTenantSubscription } from '@/app/(dashboard)/admin/actions'

const mockCtx = getCurrentTenantContext as unknown as ReturnType<typeof vi.fn>
const mockCreateAdminClient = createAdminClient as unknown as ReturnType<typeof vi.fn>

function asSuperAdmin() {
  mockCtx.mockResolvedValue({
    user_id: 'u-admin', email: 'itmano@itmano.com', role: 'super_admin',
    tenant_id: null, agent_id: null, acting_as_tenant: false,
  } satisfies TenantContext)
}

/** Fake con las dos tablas que toca esta acción: subscriptions y tenants. */
function makeFakeSupabase(planAnterior: string | null) {
  const tenantUpdates: unknown[] = []
  const client = {
    from(table: string) {
      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({
                data: planAnterior ? { plan: planAnterior } : null, error: null,
              }),
            }),
          }),
          upsert: () => Promise.resolve({ error: null }),
        }
      }
      if (table === 'tenants') {
        return {
          update(payload: unknown) {
            tenantUpdates.push(payload)
            return { eq: () => Promise.resolve({ error: null }) }
          },
        }
      }
      throw new Error(`tabla no mockeada en este fake: ${table}`)
    },
  }
  return { tenantUpdates, client }
}

beforeEach(() => {
  mockCtx.mockReset()
  mockCreateAdminClient.mockReset()
  asSuperAdmin()
})

describe('updateTenantSubscription — el presupuesto NUNCA se toca en prueba', () => {
  it('guardar un tenant en trial (plan growth, sin cambio real) no toca el presupuesto', async () => {
    const fake = makeFakeSupabase('growth')
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    const res = await updateTenantSubscription({
      tenantId: 'tenant-x', plan: TRIAL.plan, status: 'trial',
      trialEndsAt: '2026-12-01T23:59:59.000Z',
    })

    expect(res.ok).toBe(true)
    expect(fake.tenantUpdates).toEqual([])
  })

  // El caso que de verdad detona el bug: el formulario del Centro de control
  // manda SIEMPRE el estado completo, así que guardar cualquier campo de un
  // tenant en prueba re-envía plan/status. Si `planAnterior` viniera vacío (p.
  // ej. la fila de subscriptions aún no existe) esto NO debe sincronizar el
  // presupuesto de Growth de pago sobre el de cortesía.
  it('guardar un tenant en trial sin fila previa de subscriptions tampoco toca el presupuesto', async () => {
    const fake = makeFakeSupabase(null)
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    const res = await updateTenantSubscription({
      tenantId: 'tenant-x', plan: TRIAL.plan, status: 'trial',
      trialEndsAt: '2026-12-01T23:59:59.000Z',
    })

    expect(res.ok).toBe(true)
    expect(fake.tenantUpdates).toEqual([])
  })
})

describe('updateTenantSubscription — un cambio de plan real SÍ sincroniza', () => {
  it('subir de Esencial a Growth (ambos de pago) escribe el presupuesto de Growth', async () => {
    const fake = makeFakeSupabase('esencial')
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    const res = await updateTenantSubscription({
      tenantId: 'tenant-x', plan: 'growth', status: 'active',
    })

    expect(res.ok).toBe(true)
    expect(fake.tenantUpdates).toEqual([
      { ai_monthly_limit_usd: PLANS.growth.limits.aiBudgetUsd },
    ])
  })

  it('un upsert con el MISMO plan (sólo cambia el estado) no toca el presupuesto', async () => {
    const fake = makeFakeSupabase('growth')
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    const res = await updateTenantSubscription({
      tenantId: 'tenant-x', plan: 'growth', status: 'active',
    })

    expect(res.ok).toBe(true)
    expect(fake.tenantUpdates).toEqual([])
  })

  it('convertir una prueba a un plan de pago SÍ sincroniza (status ya no es trial)', async () => {
    const fake = makeFakeSupabase('growth')
    mockCreateAdminClient.mockReturnValue(fake.client as unknown as ReturnType<typeof createAdminClient>)

    const res = await updateTenantSubscription({
      tenantId: 'tenant-x', plan: 'partner', status: 'active',
    })

    expect(res.ok).toBe(true)
    expect(fake.tenantUpdates).toEqual([
      { ai_monthly_limit_usd: PLANS.partner.limits.aiBudgetUsd },
    ])
  })
})
