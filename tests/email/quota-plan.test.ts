import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tope mensual de correos del plan en TODOS los envíos corporativos:
// automatizaciones paran al 100 %, el envío humano al 110 %, y el conteo es
// fresco (no el cache() de getTenantUsage) para que un lote no pase el tope.

const getSubscription = vi.fn()
const countSends = vi.fn()
const sendSequenceEmail = vi.fn()

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(fn: T) => fn }))
vi.mock('@/lib/data/subscriptions', () => ({ getSubscription: (...a: unknown[]) => getSubscription(...a) }))
// El conteo real de quota.ts (email_sends) sale de este cliente falso.
const runUpdates: { patch: unknown; filters: [string, unknown][] }[] = []
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      const filters: [string, unknown][] = []
      let patch: unknown = null
      q.select = () => q
      q.update = (p: unknown) => { patch = p; return q }
      q.eq = (c: string, v: unknown) => { filters.push([c, v]); return q }
      q.gte = () => q
      if (table === 'lead_sequence_runs') {
        q.then = (res: (v: unknown) => unknown) => {
          runUpdates.push({ patch, filters })
          return res({ data: [{ id: 'a' }, { id: 'b' }], error: null })
        }
        return q
      }
      q.then = async (res: (v: unknown) => unknown) => res({ count: await countSends() })
      return q
    },
  }),
}))
vi.mock('@/lib/services/send-sequence-email', () => ({
  sendSequenceEmail: (...a: unknown[]) => sendSequenceEmail(...a),
}))
vi.mock('@/lib/subscriptions/access-server', () => ({
  getTenantAccessFor: async () => ({ sequencesRunnable: true, customDomainAllowed: true, monthlyEmailQuota: null }),
}))

import { nextMonthStartUtc, assertEmailQuota, monthlyEmailAllowance, resumeQuotaPausedRuns } from '@/lib/subscriptions/quota'
import { isRunStale } from '@/lib/subscriptions/access'
import { processSequenceRun } from '@/lib/services/process-sequence-run'

function setPlan(plan: 'esencial' | 'growth' | 'partner', extra: Record<string, unknown> = {}) {
  getSubscription.mockResolvedValue({
    plan, status: 'active', billingExempt: false, trialEndsAt: null, degradedAt: null, ...extra,
  })
}

beforeEach(() => {
  getSubscription.mockReset()
  countSends.mockReset().mockResolvedValue(0)
  sendSequenceEmail.mockReset().mockResolvedValue({ ok: true, outcome: 'sent', resendEmailId: 'r1' })
  setPlan('esencial')
})

describe('assertEmailQuota (tope del plan)', () => {
  it('one-off sigue al 100% y para al 110%', async () => {
    // Esencial: 3.000/mes. Envío humano con 10 % de margen => bloquea en 3.300.
    countSends.mockResolvedValue(3000)
    expect(await assertEmailQuota('t1', 'manual')).toBeNull()
    countSends.mockResolvedValue(3299)
    expect(await assertEmailQuota('t1', 'manual')).toBeNull()
    countSends.mockResolvedValue(3300)
    const denied = await assertEmailQuota('t1', 'manual')
    expect(denied?.ok).toBe(false)
    expect(denied?.error).toMatch(/Personal/)
  })

  it('el envío automático para exactamente en el 100%', async () => {
    countSends.mockResolvedValue(2999)
    expect(await assertEmailQuota('t1', 'automated')).toBeNull()
    countSends.mockResolvedValue(3000)
    expect((await assertEmailQuota('t1', 'automated'))?.ok).toBe(false)
  })

  it('cada llamada cuenta de nuevo (un lote no ve un uso congelado)', async () => {
    countSends.mockResolvedValueOnce(2999).mockResolvedValueOnce(3000)
    expect(await assertEmailQuota('t1', 'automated')).toBeNull()
    expect((await assertEmailQuota('t1', 'automated'))?.ok).toBe(false)
    expect(countSends).toHaveBeenCalledTimes(2)
  })

  it('en modo degradado manda la cuota de cortesía sin margen', async () => {
    setPlan('growth', { status: 'cancelled', degradedAt: '2026-11-10T00:00:00.000Z' })
    countSends.mockResolvedValue(199)
    expect(await assertEmailQuota('t1', 'manual')).toBeNull()
    countSends.mockResolvedValue(200)
    expect((await assertEmailQuota('t1', 'manual'))?.ok).toBe(false)
  })

  it('billing_exempt no tiene tope', async () => {
    setPlan('esencial', { billingExempt: true })
    countSends.mockResolvedValue(999_999)
    expect(await assertEmailQuota('t1', 'manual')).toBeNull()
    expect(await assertEmailQuota('t1', 'automated')).toBeNull()
  })
})

describe('monthlyEmailAllowance', () => {
  it('conserva { limit, used } con el tope del plan', async () => {
    setPlan('growth')
    countSends.mockResolvedValue(120)
    expect(await monthlyEmailAllowance('t1')).toEqual({ limit: 15000, used: 120 })
  })

  it('en modo degradado el límite es la cuota de cortesía', async () => {
    setPlan('growth', { status: 'cancelled', degradedAt: '2026-11-10T00:00:00.000Z' })
    countSends.mockResolvedValue(50)
    expect(await monthlyEmailAllowance('t1')).toEqual({ limit: 200, used: 50 })
  })
})

describe('nextMonthStartUtc', () => {
  it('primer día del mes siguiente en UTC', () => {
    expect(nextMonthStartUtc(new Date('2026-11-03T10:00:00.000Z'))).toBe('2026-12-01T00:00:00.000Z')
  })

  it('diciembre salta a enero del año siguiente', () => {
    expect(nextMonthStartUtc(new Date('2026-12-31T23:59:59.000Z'))).toBe('2027-01-01T00:00:00.000Z')
  })

  it('el run reprogramado no queda stale', () => {
    const next = nextMonthStartUtc(new Date('2026-11-30T23:00:00.000Z'))
    expect(isRunStale(next, new Date(next))).toBe(false)
    // Incluso con un tick tardío de 29 días.
    expect(isRunStale(next, new Date(new Date(next).getTime() + 29 * 86_400_000))).toBe(false)
  })
})

// ─── processSequenceRun ───────────────────────────────────────────────────────

type Update = { table: string; patch: Record<string, unknown>; filters: [string, unknown][] }

function fakeDb(updates: Update[], nextSendAt = '2026-11-03T10:00:00.000Z') {
  const rows: Record<string, unknown> = {
    lead_sequence_runs: {
      id: 'run1', tenant_id: 't1', lead_id: 'l1', sequence_id: 's1',
      current_step_order: 1, status: 'active', next_send_at: nextSendAt,
    },
    leads: {
      id: 'l1', first_name: 'Ana', email: 'ana@example.com', agent_id: 'a1', email_blocked: false,
      agents: { id: 'a1', name: 'Ag', email: 'ag@example.com' },
    },
    tenants: { id: 't1', name: 'T', slug: 't', email_from_address: null, resend_account: null, domain_status: null },
    email_sequence_steps: { id: 'st1', sequence_id: 's1', step_order: 1, resend_template_id: null, delay_hours: 24, subject: 'Hola', body_json: null },
    acquisition_channels: null,
    email_sequences: { name: 'Bienvenida', language: 'es' },
  }
  return {
    from(table: string) {
      const q: Record<string, unknown> = {}
      const filters: [string, unknown][] = []
      let patch: Record<string, unknown> | null = null
      q.select = () => q
      q.update = (p: Record<string, unknown>) => { patch = p; return q }
      q.eq = (c: string, v: unknown) => { filters.push([c, v]); return q }
      q.limit = () => q
      q.maybeSingle = async () => ({ data: rows[table] ?? null })
      q.then = (res: (v: unknown) => unknown) => {
        if (patch) updates.push({ table, patch, filters })
        return res({ data: null, error: null })
      }
      return q
    },
  }
}

describe('processSequenceRun con el tope mensual', () => {
  it('pausa por cuota reprograma al mes siguiente', async () => {
    countSends.mockResolvedValue(3000)
    const updates: Update[] = []
    const res = await processSequenceRun({ db: fakeDb(updates) as never, runId: 'run1' })

    expect(res.action).toBe('paused')
    expect(res.reason).toBe('monthly_quota')
    const upd = updates.find(u => u.table === 'lead_sequence_runs')
    expect(upd?.patch.next_send_at).toBe(nextMonthStartUtc(new Date()))
    expect(upd?.filters).toEqual(expect.arrayContaining([['id', 'run1'], ['tenant_id', 't1']]))
    // No se completa ni cancela: sigue activo y, al vencer, no es stale.
    expect(upd?.patch).not.toHaveProperty('status')
    const when = upd?.patch.next_send_at as string
    expect(isRunStale(when, new Date(when))).toBe(false)
  })

  it('secuencia pausada por cuota no envía', async () => {
    countSends.mockResolvedValue(3000)
    await processSequenceRun({ db: fakeDb([]) as never, runId: 'run1' })
    expect(sendSequenceEmail).not.toHaveBeenCalled()
  })

  it('dry run reporta la pausa sin escribir', async () => {
    countSends.mockResolvedValue(3000)
    const updates: Update[] = []
    const res = await processSequenceRun({ db: fakeDb(updates) as never, runId: 'run1', dryRun: true })
    expect(res.reason).toBe('monthly_quota')
    expect(updates).toHaveLength(0)
    expect(sendSequenceEmail).not.toHaveBeenCalled()
  })

  it('bajo el tope sigue enviando', async () => {
    countSends.mockResolvedValue(2999)
    const res = await processSequenceRun({ db: fakeDb([]) as never, runId: 'run1' })
    expect(sendSequenceEmail).toHaveBeenCalledTimes(1)
    expect(res.action).toBe('sent')
  })
})

describe('resumeQuotaPausedRuns', () => {
  it('sólo toca el marcador exacto del mes siguiente, del tenant, activos', async () => {
    runUpdates.length = 0
    const now = new Date('2026-11-10T12:00:00.000Z')
    const n = await resumeQuotaPausedRuns('t9', now)
    expect(n).toBe(2)
    expect(runUpdates[0].patch).toEqual({ next_send_at: now.toISOString() })
    expect(runUpdates[0].filters).toEqual([
      ['tenant_id', 't9'], ['status', 'active'], ['next_send_at', '2026-12-01T00:00:00.000Z'],
    ])
  })
})

describe('processSequenceRun: run stale y cuota', () => {
  it('un run stale se completa y no se reprograma aunque el tope esté lleno', async () => {
    countSends.mockResolvedValue(3000)
    const updates: Update[] = []
    const db = fakeDb(updates, '2026-01-01T00:00:00.000Z')
    const res = await processSequenceRun({ db: db as never, runId: 'run1' })
    expect(res.reason).toBe('stale_run')
    expect(updates.some(u => 'next_send_at' in u.patch)).toBe(false)
    expect(updates.find(u => u.patch.status === 'completed')).toBeTruthy()
    expect(sendSequenceEmail).not.toHaveBeenCalled()
  })
})
