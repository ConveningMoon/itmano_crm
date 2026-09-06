import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { HOSTED_SUBDOMAIN_REWRITE } from '@/lib/hosted-page'

// sitemap.xml: público en TODOS los hosts.
//
// Estaba excluido del matcher, y por eso news.itmano.com servía el sitemap con
// las páginas de marketing de ITMANO en vez del propio. Para que el rewrite
// por host de arriba pueda mandarlo a /nl, tiene que entrar al matcher; y al
// entrar, pasa también por este guard en app.itmano.com. Sin esta exención el
// sitemap del marketing quedaría detrás del login: arreglar una cosa rompería
// la otra sin ningún síntoma.
//
// robots.txt NO se trata igual y a propósito: el patrón genérico de extensión
// del matcher (`.txt$`, más abajo) ya lo excluye, y esa misma exclusión sirve
// también los .txt de licencias de fuentes bajo /studio/fonts/ — tocarla para
// meter robots.txt en el matcher rompería eso. En vez de eso, app/robots.ts se
// ramifica por host (ver ese archivo): no necesita pasar por aquí.
const SEO_FILES = new Set(['/sitemap.xml'])

// Next 16 renamed `middleware` → `proxy`. This is the EDGE auth guard for
// (dashboard) pages: refresh the Supabase session and redirect unauthenticated
// visitors to /login.
//
// BORDER guard only — getCurrentTenantContext remains the definitive guard in
// pages/actions (defense in layers; nothing here replaces it).
//
// The matcher (below) excludes ALL /api routes — each has its own auth (cron/
// webhook secrets, Resend signature, or self-guard via getCurrentTenantContext) —
// plus the public marketing routes (`/` landing, /planes, /terminos,
// /privacidad, /reembolsos), /login, /auth/*, /unsubscribe, the three hosted
// prefixes (hp/, web/, nl/) and static assets. sitemap.xml DOES enter the
// matcher (it needs the host rewrite above to reach /nl on news.itmano.com)
// and is exempted from the auth guard by SEO_FILES instead. robots.txt stays
// OUT of the matcher — the generic `.txt$` extension exclusion already covers
// it, so app/robots.ts branches by host instead of relying on this guard. So
// every other path that reaches this function is a protected page (a
// denylist: every new dashboard page is protected automatically, including
// /admin, /notifications and /activity).
export async function proxy(request: NextRequest) {
  // ── Páginas alojadas por subdominio (migración 060) ─────────────────────────
  // lm|events|forms.itmano.com/<tenant>/<canal> → /hp/... y
  // properties.itmano.com/<tenant>[/<prop>] → /web/... — públicas, sin auth.
  // Debe ir ANTES del guard: en esos hosts el path entrante ("/aj/guia") matchea
  // el denylist y sin este rewrite redirigiría a /login.
  const host = (request.headers.get('host') ?? '').toLowerCase()
  const subdomain = host.split('.')[0]
  const hostedPrefix = HOSTED_SUBDOMAIN_REWRITE[subdomain]
  if (hostedPrefix && host !== 'app.itmano.com') {
    return NextResponse.rewrite(new URL(hostedPrefix + request.nextUrl.pathname, request.url))
  }

  if (SEO_FILES.has(request.nextUrl.pathname)) return NextResponse.next()

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getClaims() en vez de getUser(): el proyecto firma los JWT con clave
  // asimétrica (ES256), así que la firma se verifica LOCALMENTE con la clave
  // pública del JWKS — cero llamadas de red por request, contra la ida y vuelta
  // a /auth/v1/user que hacía getUser(). Sigue refrescando la sesión cuando el
  // token está por vencer, que es lo único que este guard necesitaba de getUser.
  // Si algún día se volviera a una clave simétrica, getClaims cae solo al mismo
  // request remoto: se pierde la mejora, no la seguridad.
  //
  // No corras lógica entre createServerClient y esta llamada (evita logouts
  // aleatorios).
  const { data: claims } = await supabase.auth.getClaims()

  if (!claims) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', request.nextUrl.pathname)
    return NextResponse.redirect(loginUrl)
  }

  return supabaseResponse
}

export const config = {
  // Run on every page EXCEPT: the root landing (`.+` instead of `.*` leaves `/`
  // unmatched), all /api routes (own auth), /login, /auth/*, /unsubscribe, the
  // legal pages, and static assets. Mirrored by tests/auth/middleware-matcher.test.ts.
//
// `js` está en la lista de extensiones por una razón concreta: /intake.js es el
// script de medición que las landings EXTERNAS cargan desde aquí. Sin excluirlo,
// el guard lo trataba como página protegida y devolvía el HTML de /login donde
// el navegador esperaba JavaScript — el script no se ejecutaba, ninguna visita
// se registraba y no había ningún error visible. Los envíos seguían entrando
// por su propio endpoint, así que nada parecía roto.
//
// `mp4`/`webm` por lo mismo: el recorrido del producto que reproduce el hero de
// la landing vive en /landing/. Sin excluirlos, el guard le devolvía el HTML de
// /login al elemento <video> y el hero se quedaba en su marcador.
//
// `robots.txt` no está listado aparte: ya cae en la exclusión genérica de
// `.txt$` de abajo (junto con los .txt de licencias de fuentes en
// /studio/fonts/), así que nunca pasa por este guard. `sitemap.xml` sí está
// listado — `xml` no tiene exclusión genérica — porque necesita entrar al
// matcher para que el rewrite por host lo mande a /nl en news.itmano.com; ver
// SEO_FILES arriba para su exención del guard de auth.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|login|auth|unsubscribe|planes|terminos|privacidad|reembolsos|hp/|web/|nl/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|css|txt|mp4|webm)$).+)',
  ],
}
