import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

// Node < 22 no trae WebSocket global y createClient lo exige al construirse.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket

// Fase 6: la migración 20261128150000_fase06_limites añade el estado `expired`
// al CHECK de subscriptions y la columna `over_cap_since`.

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

describe.skipIf(!URL || !KEY)('fase 6: subscriptions admite expired y over_cap_since', () => {
  const client = () => createClient(URL!, KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })

  it('el CHECK admite status = expired y sigue rechazando estados desconocidos', async () => {
    // Postgres evalúa los CHECK antes que las FK (éstas son triggers diferidos al
    // final de la sentencia). Con un tenant_id inexistente: 23503 (FK) significa
    // que el CHECK pasó; 23514 significa que el CHECK lo rechazó. No queda fila.
    const insertar = (status: string) => client().from('subscriptions')
      .insert({ tenant_id: '__fase06_inexistente__', status })

    const expired = await insertar('expired')
    expect(expired.error?.code, expired.error?.message).toBe('23503')

    const invalido = await insertar('__no_existe__')
    expect(invalido.error?.code, invalido.error?.message).toBe('23514')
  })

  it('over_cap_since existe y es nullable (timestamptz)', async () => {
    const { data, error } = await client().from('subscriptions').select('over_cap_since').limit(5)
    expect(error?.message).toBeUndefined()
    for (const fila of data ?? []) {
      const v = (fila as { over_cap_since: string | null }).over_cap_since
      expect(v === null || !Number.isNaN(Date.parse(v))).toBe(true)
    }
  })
})
