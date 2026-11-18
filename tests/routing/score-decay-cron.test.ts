import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// vercel.json programa /api/cron/score-decay y Vercel Cron llama con GET. La
// ruta sólo exportaba POST, así que la entrada diaria recibía 405 y las bandas
// de calidad (refresh_quality_bands) dejaron de recalcularse. Estos tests fijan
// que GET y POST corren el mismo trabajo y que ambos exigen CRON_SECRET.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))
vi.mock('@/lib/scoring/auto-calibration', () => ({ runAutoCalibrations: vi.fn(async () => []) }))

import { createAdminClient } from '@/lib/supabase/admin'
import { runAutoCalibrations } from '@/lib/scoring/auto-calibration'
import { GET, POST } from '@/app/api/cron/score-decay/route'

const mockCreateAdminClient = createAdminClient as unknown as ReturnType<typeof vi.fn>
const mockRunAutoCalibrations = runAutoCalibrations as unknown as ReturnType<typeof vi.fn>

function fakeSupabase() {
  const rpc = vi.fn(async (fn: string) => {
    if (fn === 'decay_lead_scores') return { data: [{ stage_changed: false }], error: null }
    if (fn === 'refresh_quality_bands') return { data: 2, error: null }
    return { data: null, error: { message: `rpc inesperada: ${fn}` } }
  })
  return { rpc }
}

function request(method: 'GET' | 'POST', auth?: string, query = '') {
  return new NextRequest(`https://app.example.com/api/cron/score-decay${query}`, {
    method,
    headers: auth ? { authorization: auth } : {},
  })
}

describe('cron score-decay', () => {
  const prevSecret = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret'
    mockCreateAdminClient.mockReset()
    mockRunAutoCalibrations.mockClear()
  })

  afterEach(() => {
    process.env.CRON_SECRET = prevSecret
  })

  it.each([['GET', GET], ['POST', POST]] as const)('%s sin secreto responde 401 y no toca la base', async (method, handler) => {
    const res = await handler(request(method))
    expect(res.status).toBe(401)
    expect(mockCreateAdminClient).not.toHaveBeenCalled()
  })

  it.each([['GET', GET], ['POST', POST]] as const)('%s con secreto aplica el decay y recalcula las bandas', async (method, handler) => {
    const db = fakeSupabase()
    mockCreateAdminClient.mockReturnValue(db)

    const res = await handler(request(method, 'Bearer test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.quality_bands_refreshed).toBe(2)
    expect(db.rpc).toHaveBeenCalledWith('decay_lead_scores', { p_dry_run: false })
    expect(db.rpc).toHaveBeenCalledWith('refresh_quality_bands')
  })

  it('dry_run no recalcula las bandas', async () => {
    const db = fakeSupabase()
    mockCreateAdminClient.mockReturnValue(db)

    const res = await GET(request('GET', 'Bearer test-secret', '?dry_run=true'))
    const body = await res.json()

    expect(body.dry_run).toBe(true)
    expect(body.quality_bands_refreshed).toBeNull()
    expect(db.rpc).not.toHaveBeenCalledWith('refresh_quality_bands')
    expect(mockRunAutoCalibrations).not.toHaveBeenCalled()
  })

  it('calibra los tenants antes de recalcular las bandas', async () => {
    const db = fakeSupabase()
    mockCreateAdminClient.mockReturnValue(db)
    mockRunAutoCalibrations.mockResolvedValueOnce([{ tenantId: 't1', applied: true }, { tenantId: 't2', applied: false, reason: 'sin_evidencia' }])

    const res = await GET(request('GET', 'Bearer test-secret'))
    const body = await res.json()

    expect(body.calibrations_applied).toBe(1)
    expect(body.quality_bands_refreshed).toBe(2)
  })

  it('si la calibración automática falla, las bandas se recalculan igual', async () => {
    const db = fakeSupabase()
    mockCreateAdminClient.mockReturnValue(db)
    mockRunAutoCalibrations.mockRejectedValueOnce(new Error('sin red'))

    const res = await GET(request('GET', 'Bearer test-secret'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.calibrations_applied).toBeNull()
    expect(db.rpc).toHaveBeenCalledWith('refresh_quality_bands')
  })
})

describe('isScoringStale (aviso del Centro de control)', () => {
  it('avisa cuando las bandas superan las 36 h', async () => {
    const { isScoringStale } = await import('@/lib/data/super-admin')
    const now = Date.parse('2026-11-17T12:00:00Z')
    expect(isScoringStale('2026-08-25T07:52:43Z', now)).toBe(true)
    expect(isScoringStale('2026-11-15T23:00:00Z', now)).toBe(true)
    expect(isScoringStale('2026-11-16T13:00:00Z', now)).toBe(false)
    expect(isScoringStale(null, now)).toBe(false)
  })
})
