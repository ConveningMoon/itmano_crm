import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateDevLogin } from '@/lib/auth/dev-login'

// GET /api/dev/login?secret=...&email=...[&next=/leads]
//
// Inicia sesión en desarrollo sin pasar por el correo. NO crea la sesión por su
// cuenta: pide a Supabase el token del Magic Link y se lo entrega al MISMO
// /auth/callback que usa el enlace real, así que la cookie la emite el flujo de
// producción y no una variante paralela que podría divergir de él.
//
// Los cinco cierres que la protegen viven en `evaluateDevLogin` y están
// probados en tests/auth/dev-login.test.ts. Cualquier fallo responde 404 sin
// distinguir el motivo: desde fuera, la ruta no existe.
//
// El matcher de src/proxy.ts excluye /api, así que este handler es su propio
// guardián — no hay un guard anterior que lo cubra.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const decision = evaluateDevLogin(
    {
      nodeEnv:     process.env.NODE_ENV,
      vercel:      process.env.VERCEL,
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      allowedRef:  process.env.DEV_LOGIN_ALLOWED_SUPABASE_REF,
      secret:      process.env.DEV_LOGIN_SECRET,
    },
    {
      secret: searchParams.get('secret'),
      email:  searchParams.get('email'),
      host:   request.headers.get('host'),
    }
  )

  if (!decision.ok) {
    // El motivo sólo va al log del servidor: quien llama recibe un 404 pelado.
    console.warn(JSON.stringify({ service: 'dev-login', denied: decision.reason }))
    return new NextResponse(null, { status: 404 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type:  'magiclink',
    email: decision.email,
  })

  const tokenHash = data?.properties?.hashed_token
  if (error || !tokenHash) {
    // En este proyecto la Admin API estuvo restringida a nivel de proyecto (ver
    // el comentario de tests/rls/setup.ts). Si vuelve a estarlo, el detalle sale
    // aquí en claro: es una ruta que sólo responde en local contra el sandbox.
    console.error(JSON.stringify({ service: 'dev-login', step: 'generateLink', error: error?.message ?? 'sin hashed_token' }))
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? 'Supabase no devolvió hashed_token',
        pista: 'Si la Admin API está bloqueada en el proyecto, habilítala o crea el usuario con rls_test_create_user antes de pedir el enlace.',
      },
      { status: 502 }
    )
  }

  const destino = new URL('/auth/callback', request.url)
  destino.searchParams.set('token_hash', tokenHash)
  destino.searchParams.set('type', 'magiclink')
  // Sin `next` explícito el callback bifurca por rol (el super_admin cae en
  // /admin), que es el mismo comportamiento del enlace real.
  const next = searchParams.get('next')
  if (next) destino.searchParams.set('next', next)

  return NextResponse.redirect(destino)
}
