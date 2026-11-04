import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// La lista de grupales pide las métricas de todos sus envíos en UNA llamada a
// la RPC (antes, el detalle la pedía de uno en uno). Un fallo de la RPC no debe
// tumbar la pestaña: se registra y la lista se muestra sin cifras.

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }))

import { createAdminClient } from '@/lib/supabase/admin'
import { getBroadcastsMetrics, getBroadcastMetrics } from '@/lib/data/email-broadcasts'

const mockAdmin = createAdminClient as unknown as ReturnType<typeof vi.fn>

function fakeRpc(result: { data?: unknown; error?: { message: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null })
  mockAdmin.mockReturnValue({ rpc })
  return rpc
}

const ZEROS = { leads: 0, clicked: 0, replied: 0, bounced: 0, complained: 0, unsubscribed: 0 }

describe('getBroadcastsMetrics', () => {
  beforeEach(() => { mockAdmin.mockReset() })
  afterEach(() => { vi.restoreAllMocks() })

  it('pide todas las ids en una sola llamada con el tenant', async () => {
    const rpc = fakeRpc({ data: {
      a: { leads: 10, clicked: 2, replied: 1, bounced: 0, complained: 0, unsubscribed: 0 },
      b: { leads: 5, clicked: 0, replied: 0, bounced: 1, complained: 0, unsubscribed: 0 },
    } })
    const res = await getBroadcastsMetrics('t1', ['a', 'b'])
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('email_broadcast_metrics', { p_tenant_id: 't1', p_broadcast_ids: ['a', 'b'] })
    expect(res.a.leads).toBe(10)
    expect(res.a.clicked).toBe(2)
    expect(res.b.bounced).toBe(1)
  })

  it('sin ids no llama a la base', async () => {
    const rpc = fakeRpc({ data: {} })
    const res = await getBroadcastsMetrics('t1', [])
    expect(res).toEqual({})
    expect(rpc).not.toHaveBeenCalled()
    expect(mockAdmin).not.toHaveBeenCalled()
  })

  it('un id sin datos recibe ceros', async () => {
    fakeRpc({ data: { a: { leads: 3, clicked: 1 } } })
    const res = await getBroadcastsMetrics('t1', ['a', 'b'])
    expect(res.a).toEqual({ ...ZEROS, leads: 3, clicked: 1 })
    expect(res.b).toEqual(ZEROS)
  })

  it('un error de RPC se registra y devuelve vacío', async () => {
    fakeRpc({ error: { message: 'boom' } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await getBroadcastsMetrics('t1', ['a'])
    expect(res).toEqual({})
    expect(spy).toHaveBeenCalled()
  })
})

describe('getBroadcastMetrics (detalle)', () => {
  beforeEach(() => { mockAdmin.mockReset() })

  it('devuelve las métricas de un envío y sigue lanzando si la RPC falla', async () => {
    fakeRpc({ data: { a: { leads: 4, clicked: 1 } } })
    expect(await getBroadcastMetrics('t1', 'a')).toEqual({ ...ZEROS, leads: 4, clicked: 1 })
    fakeRpc({ error: { message: 'boom' } })
    await expect(getBroadcastMetrics('t1', 'a')).rejects.toThrow('boom')
  })
})
