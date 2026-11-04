import { describe, it, expect, beforeEach, vi } from 'vitest'

// getNewsletterStats no cuenta dados de baja como suscriptores, pero sí un
// hard_bounce. Un `.neq('email_blocked_reason', 'unsubscribed')` descartaría
// también los nulos (NULL <> x no es verdadero): hay que usar `.or`.

interface Call { method: string; args: unknown[] }
interface Recorded { table: string; calls: Call[] }

let queries: Recorded[] = []

function fakeQuery(record: Recorded): unknown {
  const q: unknown = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: [], error: null })
      return (...args: unknown[]) => { record.calls.push({ method: prop, args }); return q }
    },
  })
  return q
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from(table: string) {
      const record: Recorded = { table, calls: [] }
      queries.push(record)
      return fakeQuery(record)
    },
  }),
}))

const { getNewsletterStats } = await import('@/lib/data/newsletter-stats')

beforeEach(() => { queries = [] })

describe('getNewsletterStats — suscriptores activos', () => {
  it('filtra los dados de baja sin descartar los nulos ni los hard_bounce', async () => {
    await getNewsletterStats('tenant-aj')
    const leads = queries.find(q => q.table === 'leads')!
    const or = leads.calls.filter(c => c.method === 'or')
    expect(or).toHaveLength(1)
    expect(or[0].args[0]).toBe('email_blocked_reason.is.null,email_blocked_reason.neq.unsubscribed')
    expect(leads.calls.some(c => c.method === 'neq')).toBe(false)
    expect(leads.calls).toContainEqual({ method: 'eq', args: ['tenant_id', 'tenant-aj'] })
    const select = leads.calls.find(c => c.method === 'select')!.args[0] as string
    expect(select).toContain('email_blocked_reason')
  })
})
