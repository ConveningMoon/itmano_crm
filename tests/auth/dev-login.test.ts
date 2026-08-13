import { describe, it, expect, vi, afterEach } from 'vitest'
import { evaluateDevLogin, refDeSupabaseUrl, type DevLoginEnv } from '@/lib/auth/dev-login'
import { GET } from '@/app/api/dev/login/route'

// /api/dev/login entra al CRM sin pasar por el correo. Es una llave, y lo único
// que impide que abra la puerta equivocada son los cinco cierres de
// evaluateDevLogin. Este archivo es la garantía de que ninguno se cae sin que
// alguien se entere: si un refactor elimina un cierre, aquí se rompe.

const REF_SANDBOX     = 'xpaixcowvyksgluazwzn'
const REF_PRODUCCION  = 'kvmjlrvlnhiarrqxulkr'
const SECRETO         = 'secreto-de-desarrollo-32-chars-ok'

// Entorno correcto: local, contra el sandbox, con el secreto configurado.
const ENV_OK: DevLoginEnv = {
  nodeEnv:     'development',
  vercel:      undefined,
  supabaseUrl: `https://${REF_SANDBOX}.supabase.co`,
  allowedRef:  REF_SANDBOX,
  secret:      SECRETO,
}

const PETICION_OK = {
  secret: SECRETO,
  email:  'dj.vergara54321@gmail.com',
  host:   'localhost:3000',
}

describe('dev-login — el caso que SÍ debe pasar', () => {
  it('acepta en local, contra el sandbox y con el secreto correcto', () => {
    const d = evaluateDevLogin(ENV_OK, PETICION_OK)
    expect(d).toEqual({ ok: true, email: 'dj.vergara54321@gmail.com' })
  })

  it('normaliza el email a minúsculas y sin espacios', () => {
    const d = evaluateDevLogin(ENV_OK, { ...PETICION_OK, email: '  DJ.Vergara54321@Gmail.com ' })
    expect(d).toEqual({ ok: true, email: 'dj.vergara54321@gmail.com' })
  })

  it.each(['localhost', '127.0.0.1:3000', '[::1]:3000', 'LOCALHOST:3000'])(
    'acepta el host local %s',
    host => {
      expect(evaluateDevLogin(ENV_OK, { ...PETICION_OK, host }).ok).toBe(true)
    }
  )
})

describe('dev-login — el entorno cierra la puerta', () => {
  it('en production no responde, aunque el secreto sea correcto', () => {
    const d = evaluateDevLogin({ ...ENV_OK, nodeEnv: 'production' }, PETICION_OK)
    expect(d).toEqual({ ok: false, reason: 'produccion' })
  })

  it('en Vercel no responde (los previews también compilan en production)', () => {
    const d = evaluateDevLogin({ ...ENV_OK, vercel: '1' }, PETICION_OK)
    expect(d).toEqual({ ok: false, reason: 'vercel' })
  })

  it('sin DEV_LOGIN_SECRET configurado no responde', () => {
    const d = evaluateDevLogin({ ...ENV_OK, secret: undefined }, PETICION_OK)
    expect(d).toEqual({ ok: false, reason: 'sin_secreto_configurado' })
  })

  it('no responde a un host que no sea local', () => {
    const d = evaluateDevLogin(ENV_OK, { ...PETICION_OK, host: 'app.itmano.com' })
    expect(d).toEqual({ ok: false, reason: 'host_no_local' })
  })
})

describe('dev-login — el secreto', () => {
  it('rechaza un secreto equivocado', () => {
    const d = evaluateDevLogin(ENV_OK, { ...PETICION_OK, secret: 'otro-secreto-cualquiera-de-32-ch' })
    expect(d).toEqual({ ok: false, reason: 'secreto_invalido' })
  })

  it('rechaza sin lanzar cuando el largo no coincide (timingSafeEqual exige igual largo)', () => {
    const d = evaluateDevLogin(ENV_OK, { ...PETICION_OK, secret: 'corto' })
    expect(d).toEqual({ ok: false, reason: 'secreto_invalido' })
  })

  it('rechaza cuando no se manda secreto', () => {
    const d = evaluateDevLogin(ENV_OK, { ...PETICION_OK, secret: null })
    expect(d).toEqual({ ok: false, reason: 'secreto_invalido' })
  })
})

describe('dev-login — el cierre que de verdad importa: contra qué base apunta', () => {
  it('se niega si la app apunta al proyecto de producción', () => {
    const d = evaluateDevLogin(
      { ...ENV_OK, supabaseUrl: `https://${REF_PRODUCCION}.supabase.co` },
      PETICION_OK
    )
    expect(d).toEqual({ ok: false, reason: 'proyecto_no_permitido' })
  })

  it('se niega si no hay proyecto permitido declarado (deny by default)', () => {
    const d = evaluateDevLogin({ ...ENV_OK, allowedRef: undefined }, PETICION_OK)
    expect(d).toEqual({ ok: false, reason: 'sin_proyecto_permitido' })
  })

  it('exige igualdad exacta del ref, no que lo contenga', () => {
    // Un `includes` daría por bueno este host, que es otro proyecto.
    const d = evaluateDevLogin(
      { ...ENV_OK, supabaseUrl: `https://${REF_SANDBOX}-replica.supabase.co` },
      PETICION_OK
    )
    expect(d).toEqual({ ok: false, reason: 'proyecto_no_permitido' })
  })

  it('se niega si la URL de Supabase falta o es inválida', () => {
    expect(evaluateDevLogin({ ...ENV_OK, supabaseUrl: undefined }, PETICION_OK))
      .toEqual({ ok: false, reason: 'proyecto_no_permitido' })
    expect(evaluateDevLogin({ ...ENV_OK, supabaseUrl: 'no-es-una-url' }, PETICION_OK))
      .toEqual({ ok: false, reason: 'proyecto_no_permitido' })
  })
})

describe('dev-login — la petición', () => {
  it('exige un email', () => {
    expect(evaluateDevLogin(ENV_OK, { ...PETICION_OK, email: null }))
      .toEqual({ ok: false, reason: 'sin_email' })
    expect(evaluateDevLogin(ENV_OK, { ...PETICION_OK, email: '   ' }))
      .toEqual({ ok: false, reason: 'sin_email' })
  })
})

// La función pura puede estar impecable y la ruta seguir siendo insegura si lee
// la variable equivocada. Esto ejercita el handler de verdad, con process.env.
describe('dev-login — el handler cableado a process.env', () => {
  afterEach(() => vi.unstubAllEnvs())

  function pedir(query: string, host = 'localhost:3000') {
    return GET(new Request(`http://localhost:3000/api/dev/login${query}`, {
      headers: { host },
    }) as never)
  }

  function entorno(over: Partial<Record<string, string>> = {}) {
    const base: Record<string, string> = {
      NODE_ENV:                       'development',
      VERCEL:                         '',
      NEXT_PUBLIC_SUPABASE_URL:       `https://${REF_SANDBOX}.supabase.co`,
      DEV_LOGIN_ALLOWED_SUPABASE_REF: REF_SANDBOX,
      DEV_LOGIN_SECRET:               SECRETO,
      ...over,
    }
    for (const [k, v] of Object.entries(base)) vi.stubEnv(k, v)
  }

  it('404 cuando la app apunta a produccion, aunque el secreto sea el correcto', async () => {
    entorno({ NEXT_PUBLIC_SUPABASE_URL: `https://${REF_PRODUCCION}.supabase.co` })
    const res = await pedir(`?secret=${SECRETO}&email=a@b.com`)
    expect(res.status).toBe(404)
  })

  it('404 cuando no hay proyecto permitido declarado', async () => {
    entorno({ DEV_LOGIN_ALLOWED_SUPABASE_REF: '' })
    const res = await pedir(`?secret=${SECRETO}&email=a@b.com`)
    expect(res.status).toBe(404)
  })

  it('404 con el secreto equivocado', async () => {
    entorno()
    const res = await pedir('?secret=otro&email=a@b.com')
    expect(res.status).toBe(404)
  })

  it('404 desde un host que no es local', async () => {
    entorno()
    const res = await pedir(`?secret=${SECRETO}&email=a@b.com`, 'app.itmano.com')
    expect(res.status).toBe(404)
  })

  it('404 corriendo en Vercel', async () => {
    entorno({ VERCEL: '1' })
    const res = await pedir(`?secret=${SECRETO}&email=a@b.com`)
    expect(res.status).toBe(404)
  })

  it('nunca responde 404 con cuerpo: no filtra el motivo', async () => {
    entorno({ DEV_LOGIN_SECRET: '' })
    const res = await pedir(`?secret=${SECRETO}&email=a@b.com`)
    expect(res.status).toBe(404)
    expect(await res.text()).toBe('')
  })
})

describe('refDeSupabaseUrl', () => {
  it('extrae el ref del proyecto', () => {
    expect(refDeSupabaseUrl(`https://${REF_SANDBOX}.supabase.co`)).toBe(REF_SANDBOX)
  })

  it('devuelve null para lo que no es una URL', () => {
    expect(refDeSupabaseUrl(undefined)).toBeNull()
    expect(refDeSupabaseUrl('')).toBeNull()
    expect(refDeSupabaseUrl('vaya/cosa')).toBeNull()
  })
})
