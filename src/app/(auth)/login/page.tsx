'use client'

import { useState, useRef, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const COOLDOWN_SECONDS = 60

// B2B private tool: only pre-provisioned accounts (admin onboarding / agent
// invitations) can log in. Revealing account existence is an accepted trade-off.
const NO_ACCESS_MSG = 'Este correo no tiene acceso a la plataforma. Si crees que es un error, contacta a tu administrador.'

// Maps a ?error= query param (set by the callback / middleware / context guard)
// to a friendly message.
function messageForErrorParam(code: string | null): string | null {
  switch (code) {
    case 'sin-acceso':            return NO_ACCESS_MSG
    case 'auth_callback_failed':  return 'No pudimos validar tu enlace de acceso. Solicita uno nuevo.'
    default:                      return null
  }
}

function LoginForm() {
  const searchParams = useSearchParams()
  const nextParam = useRef<string>(searchParams.get('next') ?? '/dashboard')

  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(messageForErrorParam(searchParams.get('error')))
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const id = setInterval(() => {
      setCooldown(c => {
        if (c <= 1) { clearInterval(id); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cooldown > 0])

  async function handleSend() {
    if (loading || cooldown > 0 || !email) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const next = /^\/[^\/\\]/.test(nextParam.current) || nextParam.current === '/' ? nextParam.current : '/dashboard'

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // Login never creates accounts — every legitimate user is pre-provisioned
        // (admin onboarding / agent invitation) before their first Magic Link.
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (authError) {
      // With shouldCreateUser:false, an unregistered email returns an error.
      // Show the friendly no-access message; rate limiting gets its own note.
      setError(authError.status === 429
        ? 'Demasiados intentos. Espera un momento e inténtalo de nuevo.'
        : NO_ACCESS_MSG)
      setLoading(false)
    } else {
      setLoading(false)
      setCooldown(COOLDOWN_SECONDS)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '380px',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '16px',
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: '28px',
              fontWeight: '600',
              letterSpacing: '0.08em',
              color: 'var(--accent-gold)',
              marginBottom: '6px',
            }}
          >
            ITMANO
          </div>
          <div
            style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            Growth Partner Platform
          </div>
        </div>

          <>
            {/* Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="tu@email.com"
                  disabled={loading || cooldown > 0}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div style={{ fontSize: '12px', color: 'var(--accent-coral)', textAlign: 'center' }}>
                {error}
              </div>
            )}

            {/* CTA */}
            <button
              onClick={handleSend}
              disabled={loading || cooldown > 0}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: (loading || cooldown > 0) ? 'var(--accent-gold-dim)' : 'var(--accent-gold)',
                color: 'var(--bg-base)',
                fontSize: '13px',
                fontWeight: '600',
                letterSpacing: '0.06em',
                cursor: (loading || cooldown > 0) ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s',
              }}
            >
              {loading
                ? 'Enviando...'
                : cooldown > 0
                  ? `Reintentar en ${cooldown}s...`
                  : 'Enviar enlace de acceso'}
            </button>

            {/* Success notice — visible during cooldown */}
            {cooldown > 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center', lineHeight: '1.5' }}>
                Revisa tu correo — recibirás el enlace en menos de 1 minuto.
              </div>
            )}
          </>

        <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
          ITMANO CRM
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-base)' }} />}>
      <LoginForm />
    </Suspense>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}
