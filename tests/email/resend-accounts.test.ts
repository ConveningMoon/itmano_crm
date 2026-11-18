import { afterEach, describe, expect, it, vi } from 'vitest'

// Cada cuenta de Resend usa SOLO su llave, y la falta de una no afecta a la
// otra. src/lib/resend.ts guarda los clientes en memoria del módulo, así que
// cada caso reimporta el módulo con el entorno que necesita.

type ResendModule = typeof import('@/lib/resend')

async function loadWith(env: Record<string, string>): Promise<ResendModule> {
  vi.resetModules()
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
  return import('@/lib/resend')
}

// `key` es pública en el SDK; leerla prueba qué llave usaría cada cliente.
const keyOf = (client: unknown) => (client as { key?: string }).key

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('cuentas de Resend por tenant', () => {
  it('el módulo carga y la cuenta de ITMANO envía sin la llave de A&J', async () => {
    const mod = await loadWith({ RESEND_API_KEY: '', RESEND_API_KEY_ITMANO: 're_itmano_test' })

    expect(mod.resendAccountConfigured('itmano')).toBe(true)
    expect(mod.resendAccountConfigured('aj')).toBe(false)
    expect(keyOf(mod.resendForAccount('itmano'))).toBe('re_itmano_test')
  })

  it('sin la llave de ITMANO no cae a la de A&J', async () => {
    const mod = await loadWith({ RESEND_API_KEY: 're_aj_test', RESEND_API_KEY_ITMANO: '' })

    const client = mod.resendForAccount('itmano')
    expect(keyOf(client)).not.toBe('re_aj_test')

    const res = await client.emails.send({ from: 'a@mail.itmano.com', to: 'b@example.com', subject: 's', text: 't' })
    expect(res.data).toBeNull()
    expect(res.error?.name).toBe('missing_api_key')
    expect(res.error?.message).toContain('RESEND_API_KEY_ITMANO')
  })

  it('una cuenta sin llave corta también los envíos por lote', async () => {
    const mod = await loadWith({ RESEND_API_KEY: '', RESEND_API_KEY_ITMANO: 're_itmano_test' })

    const res = await mod.resendForAccount('aj').batch.send([
      { from: 'a@mail.example.com', to: 'b@example.com', subject: 's', text: 't' },
    ])
    expect(res.data).toBeNull()
    expect(res.error?.message).toContain('RESEND_API_KEY')
  })

  it('cualquier valor distinto de "aj" usa la cuenta de ITMANO', async () => {
    const mod = await loadWith({ RESEND_API_KEY: 're_aj_test', RESEND_API_KEY_ITMANO: 're_itmano_test' })

    expect(keyOf(mod.resendForAccount(null))).toBe('re_itmano_test')
    expect(keyOf(mod.resendForAccount('otro'))).toBe('re_itmano_test')
    expect(keyOf(mod.resendForAccount('aj'))).toBe('re_aj_test')
  })

  it('la lectura de entrantes nunca usa la llave de otra cuenta', async () => {
    const mod = await loadWith({
      RESEND_API_KEY: 're_aj_test',
      RESEND_API_KEY_ITMANO: '',
      RESEND_INBOUND_API_KEY: '',
      RESEND_INBOUND_API_KEY_ITMANO: '',
    })

    expect(keyOf(mod.resendInboundForAccount('itmano'))).not.toBe('re_aj_test')
    expect(keyOf(mod.resendInboundForAccount('aj'))).toBe('re_aj_test')
  })

  it('la lectura de entrantes prefiere la llave de lectura de su cuenta', async () => {
    const mod = await loadWith({
      RESEND_API_KEY_ITMANO: 're_itmano_test',
      RESEND_INBOUND_API_KEY_ITMANO: 're_itmano_read',
    })

    expect(keyOf(mod.resendInboundForAccount('itmano'))).toBe('re_itmano_read')
  })
})
