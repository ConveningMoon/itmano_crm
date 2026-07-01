import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeEmail } from '@/lib/auth/admin-users'
import type { EmailOtpType } from '@supabase/auth-js'

// Best-effort: mark any pending invitation for this email as accepted. A failure
// here must NEVER break the login — log and continue.
async function markInvitationAccepted(email: string | undefined | null) {
  if (!email) return
  try {
    const admin = createAdminClient()
    const { error } = await admin
      .from('invitations')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('email', normalizeEmail(email))
      .eq('status', 'pending')
    if (error) {
      console.error(JSON.stringify({ service: 'auth-callback', path: 'mark_invitation_failed', error: error.message }))
    }
  } catch (err) {
    console.error(JSON.stringify({ service: 'auth-callback', path: 'mark_invitation_threw', error: err instanceof Error ? err.message : String(err) }))
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type       = (searchParams.get('type') ?? 'email') as EmailOtpType
  const next       = searchParams.get('next') ?? '/dashboard'

  if (token_hash) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    // verifyOtp is server-side: it needs no code_verifier cookie from the
    // originating browser. Works cross-device and cross-browser.
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash })

    if (!error) {
      await markInvitationAccepted(data.user?.email)
      // Validate `next` to prevent open redirect — only allow relative paths.
      const redirectTo = /^\/[^\/\\]/.test(next) || next === '/' ? next : '/dashboard'
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
