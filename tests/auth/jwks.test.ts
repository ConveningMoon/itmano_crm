import { describe, it, expect, vi, afterEach } from 'vitest'
import { AuthClient } from '@supabase/supabase-js'
import { clavesPublicas, leerJwks } from '@/lib/supabase/jwks'

// Una clave pública tal como la publica Supabase en /auth/v1/.well-known/jwks.json.
const PUBLICA = {
  kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig', key_ops: ['verify'], ext: true,
  kid: 'k-1', x: 'x', y: 'y',
}

describe('clavesPublicas', () => {
  it('acepta las claves públicas del JWKS de Supabase', () => {
    expect(clavesPublicas({ keys: [PUBLICA] })).toEqual([PUBLICA])
  })

  it('descarta claves con partes privadas, simétricas o sin kid', () => {
    const privada  = { ...PUBLICA, kid: 'k-2', d: 'secreto' }
    const simetrica = { kty: 'oct', kid: 'k-3', k: 'secreto', key_ops: ['verify'] }
    const sinKid   = { ...PUBLICA, kid: undefined }
    expect(clavesPublicas({ keys: [privada, simetrica, sinKid, PUBLICA] })).toEqual([PUBLICA])
  })

  it('sin un JWKS no hay claves', () => {
    for (const valor of [null, undefined, 'texto', {}, { keys: 'k' }, { keys: [null, 3] }]) {
      expect(clavesPublicas(valor)).toEqual([])
    }
  })
})

describe('leerJwks', () => {
  it('lee el JWKS que escribe el build', () => {
    expect(leerJwks(JSON.stringify({ keys: [PUBLICA] }))).toEqual({ keys: [PUBLICA] })
  })

  it('sin valor, con JSON roto o sin claves públicas: getClaims descargará como antes', () => {
    expect(leerJwks(undefined)).toBeUndefined()
    expect(leerJwks('')).toBeUndefined()
    expect(leerJwks('{no es json')).toBeUndefined()
    expect(leerJwks(JSON.stringify({ keys: [{ ...PUBLICA, d: 'secreto' }] }))).toBeUndefined()
  })
})

describe('opcionesClaims', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('lleva las claves del build', async () => {
    vi.stubEnv('SUPABASE_JWKS', JSON.stringify({ keys: [PUBLICA] }))
    vi.resetModules()
    const { opcionesClaims } = await import('@/lib/supabase/jwks')
    expect(opcionesClaims).toEqual({ jwks: { keys: [PUBLICA] } })
  })

  it('sin claves del build queda vacío', async () => {
    vi.stubEnv('SUPABASE_JWKS', '')
    vi.resetModules()
    const { opcionesClaims } = await import('@/lib/supabase/jwks')
    expect(opcionesClaims).toEqual({})
  })
})

// Lo que se espera de getClaims con las claves del bundle, contra la librería
// real y tokens ES256 firmados aquí. Si una versión nueva de auth-js cambiara
// este comportamiento, el cambio se ve aquí y no en producción.
describe('getClaims con las claves del build', () => {
  const ES256 = { name: 'ECDSA', namedCurve: 'P-256' } as const

  async function parDeClaves(kid: string) {
    const { publicKey, privateKey } = await crypto.subtle.generateKey(ES256, true, ['sign', 'verify'])
    const jwk = { ...(await crypto.subtle.exportKey('jwk', publicKey)), kid, alg: 'ES256', use: 'sig' }
    return { jwk: jwk as typeof jwk & { kty: string; key_ops: string[] }, privateKey }
  }

  const b64url = (datos: string | Uint8Array) => Buffer.from(datos).toString('base64url')

  async function firmar(kid: string, privateKey: CryptoKey) {
    const header  = { alg: 'ES256', typ: 'JWT', kid }
    const payload = { sub: 'u-1', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }
    const datos = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
    const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(datos))
    return `${datos}.${b64url(new Uint8Array(firma))}`
  }

  // Cliente de auth con una red falsa que anota cada petición y sirve `jwksRemoto`.
  function cliente(jwksRemoto: { keys: unknown[] }) {
    const pedidas: string[] = []
    const auth = new AuthClient({
      url: 'https://example.supabase.co/auth/v1',
      storageKey: `jwks-test-${Math.random()}`,
      persistSession: false,
      autoRefreshToken: false,
      fetch: async (input: RequestInfo | URL) => {
        pedidas.push(String(input))
        return new Response(JSON.stringify(jwksRemoto), { status: 200, headers: { 'Content-Type': 'application/json' } })
      },
    })
    return { auth, pedidas }
  }

  it('verifica el token sin pedir nada a la red', async () => {
    const { jwk, privateKey } = await parDeClaves('k-actual')
    const { auth, pedidas } = cliente({ keys: [] })

    const { data, error } = await auth.getClaims(await firmar('k-actual', privateKey), { jwks: { keys: [jwk] } })

    expect(error).toBeNull()
    expect(data?.claims.sub).toBe('u-1')
    expect(pedidas).toEqual([])
  })

  it('una clave rotada después del build se descarga como antes', async () => {
    const vieja = await parDeClaves('k-vieja')
    const nueva = await parDeClaves('k-nueva')
    const { auth, pedidas } = cliente({ keys: [nueva.jwk] })

    const { data, error } = await auth.getClaims(await firmar('k-nueva', nueva.privateKey), { jwks: { keys: [vieja.jwk] } })

    expect(error).toBeNull()
    expect(data?.claims.sub).toBe('u-1')
    expect(pedidas).toEqual(['https://example.supabase.co/auth/v1/.well-known/jwks.json'])
  })

  it('rechaza un token firmado con otra clave aunque traiga el mismo kid', async () => {
    const legitima = await parDeClaves('k-actual')
    const atacante = await parDeClaves('k-actual')
    const { auth } = cliente({ keys: [] })

    const { data, error } = await auth.getClaims(await firmar('k-actual', atacante.privateKey), { jwks: { keys: [legitima.jwk] } })

    expect(data).toBeNull()
    expect(error?.message).toMatch(/signature/i)
  })
})
