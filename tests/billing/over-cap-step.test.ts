import { describe, it, expect, vi, beforeEach } from 'vitest'

// Paso over-cap del cron: se prueba con un cliente falso que graba cada
// llamada. Cubre los filtros de exclusión (exentos, paused/cancelled/expired),
// el no-op dentro del tope, el marcado, la limpieza y el despublicado tras la
// gracia (conserva las más recientes, con tenant_id y marca de billing).

vi.mock('server-only', () => ({}))
const revalidateTag = vi.fn()
vi.mock('next/cache', () => ({ revalidateTag: (...a: unknown[]) => revalidateTag(...a) }))

import { runOverCapStep } from '@/lib/subscriptions/over-cap-step'

type Call = { table: string; method: string; args: unknown[] }

function makeDb(opts: {
  subs: Record<string, unknown>[]
  published: Record<string, number>
  rows: Record<string, { id: string }[]>
}) {
  const calls: Call[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- doble encadenable de prueba
  function builder(table: string): any {
    let head = false
    let tenant: string | null = null
    const rec = (method: string, ...args: unknown[]) => { calls.push({ table, method, args }) }
    const b = {
      select(c: string, o?: { head?: boolean }) { head = !!o?.head; rec('select', c, o); return b },
      update(p: unknown) { rec('update', p); return b },
      not(c: string, op: string, v: unknown) { rec('not', c, op, v); return b },
      eq(c: string, v: unknown) { if (c === 'tenant_id') tenant = v as string; rec('eq', c, v); return b },
      in(c: string, v: unknown) { rec('in', c, v); return b },
      order(c: string, o: unknown) { rec('order', c, o); return b },
      then(ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) {
        let res: unknown
        if (table === 'subscriptions') res = { data: opts.subs, error: null }
        else if (head) res = { count: opts.published[tenant ?? ''] ?? 0, data: null, error: null }
        else res = { data: opts.rows[tenant ?? ''] ?? [], error: null }
        return Promise.resolve(res).then(ok, err)
      },
    }
    return b
  }
  return { calls, client: { from: (t: string) => builder(t) } }
}

const now = new Date('2026-12-20T12:00:00Z')
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString()
const logError = vi.fn()

beforeEach(() => { revalidateTag.mockReset(); logError.mockReset() })

describe('runOverCapStep', () => {
  it('la consulta excluye exentos y paused/cancelled/expired', async () => {
    const db = makeDb({ subs: [], published: {}, rows: {} })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runOverCapStep(db.client as any, now, logError)
    expect(db.calls).toContainEqual({ table: 'subscriptions', method: 'not', args: ['status', 'in', '(paused,cancelled,expired)'] })
    expect(db.calls).toContainEqual({ table: 'subscriptions', method: 'eq', args: ['billing_exempt', false] })
  })

  it('un tenant dentro del tope no recibe ningún update', async () => {
    const db = makeDb({
      subs: [{ tenant_id: 't1', plan: 'growth', over_cap_since: null }],
      published: { t1: 10 }, rows: {},
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runOverCapStep(db.client as any, now, logError)
    expect(db.calls.some(c => c.method === 'update')).toBe(false)
    expect(r).toEqual({ marked: 0, cleared: 0, unpublished: 0 })
  })

  it('sobre el tope y sin marca: fija over_cap_since', async () => {
    const db = makeDb({
      subs: [{ tenant_id: 't1', plan: 'growth', over_cap_since: null }],
      published: { t1: 51 }, rows: {},
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runOverCapStep(db.client as any, now, logError)
    expect(db.calls).toContainEqual({ table: 'subscriptions', method: 'update', args: [{ over_cap_since: now.toISOString() }] })
    expect(db.calls).toContainEqual({ table: 'subscriptions', method: 'eq', args: ['tenant_id', 't1'] })
    expect(r.marked).toBe(1)
    expect(db.calls.some(c => c.table === 'properties' && c.method === 'update')).toBe(false)
  })

  it('de vuelta dentro del tope con marca: la limpia', async () => {
    const db = makeDb({
      subs: [{ tenant_id: 't1', plan: 'growth', over_cap_since: daysAgo(3) }],
      published: { t1: 5 }, rows: {},
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runOverCapStep(db.client as any, now, logError)
    expect(db.calls).toContainEqual({ table: 'subscriptions', method: 'update', args: [{ over_cap_since: null }] })
    expect(r.cleared).toBe(1)
  })

  it('pasada la gracia despublica slice(cap) de las más recientes, con tenant_id y marca', async () => {
    // Esencial (cap 0) con 3 publicadas, ya vencida la gracia.
    const rows = { t1: [{ id: 'c' }, { id: 'b' }, { id: 'a' }] }
    const db = makeDb({
      subs: [{ tenant_id: 't1', plan: 'esencial', over_cap_since: daysAgo(15) }],
      published: { t1: 3 }, rows,
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await runOverCapStep(db.client as any, now, logError)

    const orders = db.calls.filter(c => c.method === 'order').map(c => c.args)
    expect(orders).toEqual([['updated_at', { ascending: false }], ['id', { ascending: false }]])
    const upd = db.calls.findIndex(c => c.table === 'properties' && c.method === 'update')
    expect(db.calls[upd].args[0]).toEqual({ published_to_web: false, unpublished_by_billing: true })
    const after = db.calls.slice(upd + 1)
    expect(after[0]).toEqual({ table: 'properties', method: 'eq', args: ['tenant_id', 't1'] })
    expect(after[1]).toEqual({ table: 'properties', method: 'in', args: ['id', ['c', 'b', 'a']] })
    expect(r.unpublished).toBe(3)
    expect(revalidateTag).toHaveBeenCalledWith('hosted:web:t1', { expire: 0 })
  })

  it('Growth con 52 publicadas conserva las 50 más recientes (despublica las 2 últimas)', async () => {
    const ids = Array.from({ length: 52 }, (_, i) => ({ id: `p${String(52 - i).padStart(2, '0')}` }))
    const db = makeDb({
      subs: [{ tenant_id: 't1', plan: 'growth', over_cap_since: daysAgo(20) }],
      published: { t1: 52 }, rows: { t1: ids },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runOverCapStep(db.client as any, now, logError)
    const inCall = db.calls.find(c => c.table === 'properties' && c.method === 'in')
    expect(inCall?.args).toEqual(['id', ['p02', 'p01']])
  })

  it('dentro de la gracia espera sin tocar nada', async () => {
    const db = makeDb({
      subs: [{ tenant_id: 't1', plan: 'esencial', over_cap_since: daysAgo(5) }],
      published: { t1: 3 }, rows: {},
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await runOverCapStep(db.client as any, now, logError)
    expect(db.calls.some(c => c.method === 'update')).toBe(false)
  })
})
