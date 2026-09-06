import { describe, it, expect, vi, beforeEach } from 'vitest'

// La lógica real de restoreAfterReactivation es "dos consultas a Supabase" —
// no hay nada puro que extraer. En vez de conformarnos con "la función
// existe", mockeamos SOLO la forma del query builder encadenable
// (.from/.update/.eq/.select) y grabamos qué se le pidió a CADA tabla. Esto sí
// verifica el contrato crítico de la tarea: que ambos UPDATE llegan con el
// filtro `unpublished_by_billing = true` — sin él se republicaría una
// propiedad que el cliente despublicó a propósito (casa vendida) o una
// newsletter que el cliente nunca quiso publicar (borrador propio).
// Lo que este test NO cubre (requiere DB real, ver prueba manual del brief):
// RLS, que las columnas existan en el schema real, y el efecto end-to-end
// contra datos reales de un tenant.
type Call = { method: string; args: unknown[]; table?: string }

function makeFakeSupabase(rowsByTable: Record<string, Record<string, unknown>[]>) {
  const calls: Call[] = []
  function makeBuilder(table: string) {
    const rows = rowsByTable[table] ?? []
    // El builder es THENABLE: `select()` ya no cierra la cadena, porque la
    // revalidación de las rutas públicas encadena `.select().eq().maybeSingle()`
    // sobre `tenants`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble encadenable de prueba, sin tipos de Supabase
    const builder: any = {
      update(payload: unknown) {
        calls.push({ method: 'update', args: [payload], table })
        return builder
      },
      eq(col: string, val: unknown) {
        calls.push({ method: 'eq', args: [col, val], table })
        return builder
      },
      in(col: string, vals: unknown) {
        calls.push({ method: 'in', args: [col, vals], table })
        return builder
      },
      select(cols: string) {
        calls.push({ method: 'select', args: [cols], table })
        return builder
      },
      maybeSingle() {
        calls.push({ method: 'maybeSingle', args: [], table })
        return Promise.resolve({ data: rows[0] ?? null, error: null })
      },
      then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) {
        return Promise.resolve({ data: rows, error: null }).then(onOk, onErr)
      },
    }
    return builder
  }
  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: 'from', args: [table] })
        return makeBuilder(table)
      },
    },
  }
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { restoreAfterReactivation } from '@/lib/subscriptions/reactivate'

const mockCreateAdminClient = createAdminClient as unknown as ReturnType<typeof vi.fn>
const mockRevalidatePath = revalidatePath as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockCreateAdminClient.mockReset()
  mockRevalidatePath.mockReset()
})

describe('restoreAfterReactivation', () => {
  it('exporta una funcion que devuelve el conteo de republicadas', () => {
    expect(typeof restoreAfterReactivation).toBe('function')
  })

  it('propiedades: filtra por tenant_id Y unpublished_by_billing=true — el punto de la tarea', async () => {
    const fake = makeFakeSupabase({ properties: [{ id: 'p1' }, { id: 'p2' }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    const report = await restoreAfterReactivation('tenant-x')

    expect(fake.calls[0]).toEqual({ method: 'from', args: ['properties'] })

    const propsEq = fake.calls.filter((c) => c.method === 'eq' && c.table === 'properties').map((c) => c.args)
    expect(propsEq).toContainEqual(['tenant_id', 'tenant-x'])
    // Sin este filtro se republicaría una casa que el cliente quitó a propósito.
    expect(propsEq).toContainEqual(['unpublished_by_billing', true])

    expect(report).toEqual({ propertiesRepublished: 2, newslettersRepublished: 0 })
  })

  it('propiedades: el UPDATE republica Y limpia la marca de degradación, nunca solo una', async () => {
    const fake = makeFakeSupabase({ properties: [{ id: 'p1' }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    await restoreAfterReactivation('tenant-x')

    const updateCall = fake.calls.find((c) => c.method === 'update' && c.table === 'properties')
    // Si solo se limpiara `unpublished_by_billing` sin volver a `published_to_web:
    // true`, la propiedad quedaría invisible para siempre en la web pública.
    expect(updateCall?.args[0]).toEqual({ published_to_web: true, unpublished_by_billing: false })
  })

  it('newsletters: filtra por tenant_id Y unpublished_by_billing=true, y limpia la marca al republicar', async () => {
    const fake = makeFakeSupabase({ newsletter_editions: [{ id: 'n1' }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    const report = await restoreAfterReactivation('tenant-x')

    const nlEq = fake.calls.filter((c) => c.method === 'eq' && c.table === 'newsletter_editions').map((c) => c.args)
    expect(nlEq).toContainEqual(['tenant_id', 'tenant-x'])
    // Sin este filtro se republicaría una edición que el tenant nunca marcó
    // como publicada — el fallo exacto que la marca de procedencia evita.
    expect(nlEq).toContainEqual(['unpublished_by_billing', true])

    const updateCall = fake.calls.find((c) => c.method === 'update' && c.table === 'newsletter_editions')
    expect(updateCall?.args[0]).toEqual({ status: 'published', unpublished_by_billing: false })

    expect(report).toEqual({ propertiesRepublished: 0, newslettersRepublished: 1 })
  })

  it('newsletters: purga el caché de las dos rutas públicas al republicar', async () => {
    // Sin esto, el archivo del cliente que acaba de volver a pagar sigue
    // apareciendo vacío hasta que expire la ventana de ISR (300 s). Con una
    // sola newsletter por tenant no hay slug de serie que resolver: la ruta
    // de la edición cuelga directo del tenant.
    const fake = makeFakeSupabase({
      newsletter_editions: [{ id: 'n1', slug: 'agosto-2026' }],
      tenants:             [{ id: 'tenant-x', slug: 'aj' }],
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    await restoreAfterReactivation('tenant-x')

    const paths = mockRevalidatePath.mock.calls.map(c => c[0])
    expect(paths).toContain('/nl/aj')
    expect(paths).toContain('/nl/aj/agosto-2026')
  })

  it('newsletters: sin nada que republicar no toca el caché', async () => {
    const fake = makeFakeSupabase({ tenants: [{ id: 'tenant-x', slug: 'aj' }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    await restoreAfterReactivation('tenant-x')

    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it('newsletters: un borrador propio del tenant (sin la marca) no vuelve a publicarse', async () => {
    // El mock no simula el WHERE real de Postgres — solo registra qué se
    // pidió (ver comentario de cabecera). Este caso representa un tenant cuya
    // única edición es un borrador que el AGENTE dejó sin publicar a
    // propósito: nunca pasó por el paso de degradación, así que nunca llevó
    // `unpublished_by_billing = true`, y por tanto el filtro `.eq(...,true)`
    // no la habría seleccionado — de ahí que la fila simulada del lado del
    // servidor sea 0, no que el código la ignore explícitamente.
    const fake = makeFakeSupabase({ newsletter_editions: [] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    const report = await restoreAfterReactivation('tenant-x')

    const updateCall = fake.calls.find((c) => c.method === 'update' && c.table === 'newsletter_editions')
    // El UPDATE se sigue emitiendo con el filtro correcto — lo que cambia es
    // que Postgres no encuentra filas que lo cumplan, no que el código decida
    // saltárselo.
    expect(updateCall).toBeDefined()
    expect(report.newslettersRepublished).toBe(0)
  })

  it('sin filas afectadas en ninguna tabla devuelve 0 y 0, no revienta', async () => {
    const fake = makeFakeSupabase({})
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    const report = await restoreAfterReactivation('tenant-sin-degradar')
    expect(report).toEqual({ propertiesRepublished: 0, newslettersRepublished: 0 })
  })
})
