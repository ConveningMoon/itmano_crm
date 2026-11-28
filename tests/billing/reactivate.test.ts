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
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { restoreAfterReactivation } from '@/lib/subscriptions/reactivate'

const mockCreateAdminClient = createAdminClient as unknown as ReturnType<typeof vi.fn>
const mockRevalidateTag = revalidateTag as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockCreateAdminClient.mockReset()
  mockRevalidateTag.mockReset()
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

  it('newsletters: expira ya el caché de las páginas públicas del tenant al republicar', async () => {
    // Sin esto, el archivo del cliente que acaba de volver a pagar sigue
    // apareciendo vacío hasta que vencen los 5 minutos del perfil `hosted`.
    // La portada y todas las ediciones comparten el tag del tenant, y
    // `expire: 0` impide servir la copia vieja ni una vez.
    const fake = makeFakeSupabase({ newsletter_editions: [{ id: 'n1' }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    await restoreAfterReactivation('tenant-x')

    expect(mockRevalidateTag).toHaveBeenCalledWith('hosted:nl:tenant-x', { expire: 0 })
  })

  it('newsletters: sin nada que republicar no toca el caché', async () => {
    const fake = makeFakeSupabase({ tenants: [{ id: 'tenant-x', slug: 'aj' }] })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- fake de prueba, no el cliente real tipado
    mockCreateAdminClient.mockReturnValue(fake.client as any)

    await restoreAfterReactivation('tenant-x')

    expect(mockRevalidateTag).not.toHaveBeenCalled()
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

// ── Tope del plan ──────────────────────────────────────────────────────────
// Con `cap`, sólo vuelven las marcadas más recientes hasta llenar el cupo.
describe('restoreAfterReactivation con tope del plan', () => {
  // Fake que además registra order/limit/count y devuelve conteo de publicadas.
  function makeCapFake(opts: { published: number; marked: { id: string }[]; countError?: boolean }) {
    const calls: Call[] = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble encadenable de prueba
    function builder(table: string): any {
      let mode: 'select' | 'update' = 'select'
      let head = false
      const b = {
        update(p: unknown) { mode = 'update'; calls.push({ method: 'update', args: [p], table }); return b },
        select(c: string, o?: { head?: boolean }) { head = !!o?.head; calls.push({ method: 'select', args: [c, o], table }); return b },
        eq(c: string, v: unknown) { calls.push({ method: 'eq', args: [c, v], table }); return b },
        in(c: string, v: unknown) { calls.push({ method: 'in', args: [c, v], table }); return b },
        order(c: string, o: unknown) { calls.push({ method: 'order', args: [c, o], table }); return b },
        limit(n: number) { calls.push({ method: 'limit', args: [n], table }); return b },
        maybeSingle() { return Promise.resolve({ data: null, error: null }) },
        then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
          let res: unknown
          if (table !== 'properties') res = { data: [], error: null }
          else if (head) res = opts.countError ? { count: null, data: null, error: { message: 'boom' } } : { count: opts.published, data: null, error: null }
          else if (mode === 'update') {
            const inCall = calls.filter(c => c.method === 'in' && c.table === 'properties').at(-1)
            res = { data: ((inCall?.args[1] as string[]) ?? opts.marked.map(m => m.id)).map(id => ({ id })), error: null }
          } else {
            const lim = calls.filter(c => c.method === 'limit').at(-1)?.args[0] as number | undefined
            res = { data: opts.marked.slice(0, lim ?? opts.marked.length), error: null }
          }
          return Promise.resolve(res).then(ok, err)
        },
      }
      return b
    }
    return { calls, client: { from(t: string) { calls.push({ method: 'from', args: [t] }); return builder(t) } } }
  }

  const five = ['p5', 'p4', 'p3', 'p2', 'p1'].map(id => ({ id }))

  it('cap 0 (Esencial): no republica ninguna propiedad', async () => {
    const fake = makeCapFake({ published: 0, marked: five })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateAdminClient.mockReturnValue(fake.client as any)
    const report = await restoreAfterReactivation('tenant-x', { cap: 0 })
    expect(report.propertiesRepublished).toBe(0)
    expect(fake.calls.some(c => c.method === 'update' && c.table === 'properties')).toBe(false)
  })

  it('cap 2 con 5 marcadas y 0 publicadas: republica las 2 más recientes', async () => {
    const fake = makeCapFake({ published: 0, marked: five })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateAdminClient.mockReturnValue(fake.client as any)
    const report = await restoreAfterReactivation('tenant-x', { cap: 2 })

    const orders = fake.calls.filter(c => c.method === 'order').map(c => c.args)
    expect(orders[0]).toEqual(['updated_at', { ascending: false }])
    expect(orders[1]).toEqual(['id', { ascending: false }])
    expect(fake.calls.find(c => c.method === 'limit')?.args[0]).toBe(2)
    expect(fake.calls.find(c => c.method === 'in' && c.table === 'properties')?.args).toEqual(['id', ['p5', 'p4']])
    expect(report.propertiesRepublished).toBe(2)
  })

  it('cap 2 con 2 ya publicadas: no queda cupo, no republica', async () => {
    const fake = makeCapFake({ published: 2, marked: five })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateAdminClient.mockReturnValue(fake.client as any)
    const report = await restoreAfterReactivation('tenant-x', { cap: 2 })
    expect(report.propertiesRepublished).toBe(0)
    expect(fake.calls.some(c => c.method === 'update' && c.table === 'properties')).toBe(false)
  })

  it('un conteo fallido lanza y no republica nada (no se asume 0 publicadas)', async () => {
    const fake = makeCapFake({ published: 0, marked: five, countError: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateAdminClient.mockReturnValue(fake.client as any)
    await expect(restoreAfterReactivation('tenant-x', { cap: 2 })).rejects.toBeTruthy()
    expect(fake.calls.some(c => c.method === 'update' && c.table === 'properties')).toBe(false)
  })

  it('los candidatos excluyen las ya publicadas y filtran por tenant', async () => {
    const fake = makeCapFake({ published: 0, marked: five })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateAdminClient.mockReturnValue(fake.client as any)
    await restoreAfterReactivation('tenant-x', { cap: 2 })
    const eqs = fake.calls.filter(c => c.method === 'eq' && c.table === 'properties').map(c => c.args)
    expect(eqs).toContainEqual(['published_to_web', false])
    expect(eqs).toContainEqual(['unpublished_by_billing', true])
    expect(eqs).toContainEqual(['tenant_id', 'tenant-x'])
  })

  it('limpia over_cap_since del tenant al reactivar (gracia nueva)', async () => {
    const fake = makeCapFake({ published: 0, marked: five })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockCreateAdminClient.mockReturnValue(fake.client as any)
    await restoreAfterReactivation('tenant-x', { cap: 2 })
    const i = fake.calls.findIndex(c => c.method === 'update' && c.table === 'subscriptions')
    expect(i).toBeGreaterThan(-1)
    expect(fake.calls[i].args[0]).toEqual({ over_cap_since: null })
    expect(fake.calls[i + 1]).toEqual({ method: 'eq', args: ['tenant_id', 'tenant-x'], table: 'subscriptions' })
  })
})
