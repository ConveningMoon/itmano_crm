import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  asUser,
  USER_A_EMAIL,
  SUPER_ADMIN_EMAIL,
  createFixtures,
  cleanupFixtures,
} from './setup'

// Tablas y funciones del panel de operación (migración platform_ops). Son de
// PLATAFORMA: sólo el super_admin las lee, nadie las escribe con su sesión (lo
// hace el servidor con service_role) y sus RPC no las puede llamar un usuario.

const TABLES = [
  'provider_settings', 'cron_heartbeats', 'platform_metrics', 'platform_alerts',
  // Fase 3: cuotas de Resend y correos de Auth.
  'resend_usage_daily', 'resend_quota_state', 'auth_email_sends',
] as const

describe('RLS: panel de operación', () => {
  beforeAll(async () => { await createFixtures() })
  afterAll(async () => { await cleanupFixtures() })

  it('un usuario de tenant no ve ninguna fila', async () => {
    const client = await asUser(USER_A_EMAIL)
    for (const table of TABLES) {
      const { data, error } = await client.from(table).select('*').limit(5)
      expect(error, table).toBeNull()
      expect(data, table).toEqual([])
    }
  })

  it('el super_admin lee los ajustes de proveedor sembrados por la migración', async () => {
    const client = await asUser(SUPER_ADMIN_EMAIL)
    const { data, error } = await client.from('provider_settings').select('key')
    expect(error).toBeNull()
    expect((data ?? []).map(r => r.key)).toEqual(expect.arrayContaining(['resend_itmano', 'anthropic', 'supabase']))
  })

  it('ni siquiera el super_admin escribe con su sesión: sólo el servidor', async () => {
    const client = await asUser(SUPER_ADMIN_EMAIL)
    const { error: updateError } = await client.from('provider_settings').update({ notes: 'x' }).eq('key', 'vercel')
    expect(updateError?.code).toBe('42501')
    const { error: insertError } = await client.from('platform_alerts').insert({ alert_key: 'x', period: 'x', severity: 'warn', message: 'x' })
    expect(insertError?.code).toBe('42501')
  })

  it('las RPC del panel no las ejecuta un usuario autenticado', async () => {
    const client = await asUser(SUPER_ADMIN_EMAIL)
    for (const fn of ['platform_usage', 'platform_totals'] as const) {
      const { error } = await client.rpc(fn)
      expect(error, fn).not.toBeNull()
    }
    const { error } = await client.rpc('record_heartbeat', { p_job: 'x', p_ok: true })
    expect(error).not.toBeNull()
    const { error: quotaWrite } = await client.rpc('record_resend_send', { p_account: 'itmano', p_sent: 1000 })
    expect(quotaWrite).not.toBeNull()
    const { error: quotaRead } = await client.rpc('resend_quota_status', { p_account: 'itmano' })
    expect(quotaRead).not.toBeNull()
  })

  it('nadie inserta correos de Auth ni cuota con su sesión', async () => {
    const client = await asUser(SUPER_ADMIN_EMAIL)
    const { error: a } = await client.from('auth_email_sends').insert({ action_type: 'magiclink', ok: true })
    expect(a?.code).toBe('42501')
    const { error: u } = await client.from('resend_usage_daily').insert({ account: 'itmano', day: '2026-01-01', sent: 1 })
    expect(u?.code).toBe('42501')
  })
})
