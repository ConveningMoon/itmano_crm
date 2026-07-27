import { describe, it, expect, vi, beforeEach } from 'vitest'

// La lógica real de restoreAfterReactivation es "una consulta a Supabase" — no
// hay nada puro que extraer. En vez de conformarnos con "la función existe",
// mockeamos SOLO la forma del query builder encadenable (.from/.update/.eq/.select)
// y grabamos qué se le pidió. Esto sí verifica el contrato crítico de la tarea:
// que el UPDATE llega con el filtro `unpublished_by_billing = true` — sin él se
// republicaría una propiedad que el cliente despublicó a propósito (casa vendida).
// Lo que este test NO cubre (requiere DB real, ver prueba manual del brief):
// RLS, que la columna exista en el schema real, y el efecto end-to-end contra
// datos reales de un tenant.
type Call = { method: string; args: unknown[] }

function makeFakeSupabase(rows: { id: string }[]) {
  const calls: Call[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble encadenable de prueba, sin tipos de Supabase
  const builder: any = {
    update(payload: unknown) {
      calls.push({ method: 'update', args: [payload] })
      return builder
    },
    eq(col: string, val: unknown) {
      calls.push({ method: 'eq', args: [col, val] })
      return builder
    },
    select(cols: string) {
      calls.push({ method: 'select', args: [cols] })
      return Promise.resolve({ data: rows, error: null })
    },
  }
  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: 'from', args: [table] })
        return builder
      },
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { restoreAfterReactivation } from '@/lib/subscriptions/reactivate'

const mockCreateAdminClient = createAdminClient as unknown as ReturnType<typeof vi.fn>

beforeEach(() => mockCreateAdminClient.mockReset())

describe('restoreAfterReactivation', () => {
  it('exporta una funcion que devuelve el conteo de republicadas', () => {
    expect(typeof restoreAfterReactivation).toBe('function')
  })

  it('filtra por tenant_id Y unpublished_by_billing=true — el punto de la tarea', async () => {
    const fake = makeFakeSupabase([{ id: 'p1' }, { id: 'p2' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    const report = await restoreAfterReactivation('tenant-x')

    expect(fake.calls[0]).toEqual({ method: 'from', args: ['properties'] })

    const eqCalls = fake.calls.filter((c) => c.method === 'eq').map((c) => c.args)
    expect(eqCalls).toContainEqual(['tenant_id', 'tenant-x'])
    // Sin este filtro se republicaría una casa que el cliente quitó a propósito.
    expect(eqCalls).toContainEqual(['unpublished_by_billing', true])

    expect(report).toEqual({ propertiesRepublished: 2 })
  })

  it('el UPDATE republica Y limpia la marca de degradación, nunca solo una', async () => {
    const fake = makeFakeSupabase([{ id: 'p1' }])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    await restoreAfterReactivation('tenant-x')

    const updateCall = fake.calls.find((c) => c.method === 'update')
    // Si solo se limpiara `unpublished_by_billing` sin volver a `published_to_web:
    // true`, la propiedad quedaría invisible para siempre en la web pública.
    expect(updateCall?.args[0]).toEqual({ published_to_web: true, unpublished_by_billing: false })
  })

  it('sin filas afectadas devuelve 0, no revienta', async () => {
    const fake = makeFakeSupabase([])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    const report = await restoreAfterReactivation('tenant-sin-degradar')
    expect(report).toEqual({ propertiesRepublished: 0 })
  })
})
