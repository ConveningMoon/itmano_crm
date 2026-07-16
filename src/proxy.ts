import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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
// /privacidad, /reembolsos), /login, /auth/*, /unsubscribe, sitemap/robots and
// static assets. So every path
// that reaches this function is a protected page (a denylist: every new
// dashboard page is protected automatically, including /admin, /notifications
// and /activity).
export async function proxy(request: NextRequest) {
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

  // IMPORTANT: use getUser() (not getSession()); it refreshes the session. Do not
  // run logic between createServerClient and getUser() (avoids random logouts).
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
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
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|login|auth|unsubscribe|planes|terminos|privacidad|reembolsos|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).+)',
  ],
}
