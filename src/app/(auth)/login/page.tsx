'use client'

import { useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const searchParams = useSearchParams()
  const nextParam = useRef<string>(searchParams.get('next') ?? '/dashboard')

  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function handleSend() {
    if (loading || !email) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const next = /^\/[^\/\\]/.test(nextParam.current) || nextParam.current === '/' ? nextParam.current : '/dashboard'

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      setLoading(false)
      setSent(true)
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

        {sent ? (
          /* Success state */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div
              style={{
                fontSize: '13px',
                color: 'var(--text-primary)',
                textAlign: 'center',
                lineHeight: '1.5',
              }}
            >
              Revisa tu email — te enviamos un enlace de acceso.
            </div>
            <button
              onClick={() => setSent(false)}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'transparent',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: '500',
                letterSpacing: '0.04em',
                cursor: 'pointer',
              }}
            >
              Enviar de nuevo
            </button>
          </div>
        ) : (
          /* Form state */
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
                  disabled={loading}
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
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: loading ? 'var(--accent-gold-dim)' : 'var(--accent-gold)',
                color: 'var(--bg-base)',
                fontSize: '13px',
                fontWeight: '600',
                letterSpacing: '0.06em',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background-color 0.15s',
              }}
            >
              {loading ? 'Enviando...' : 'Enviar enlace de acceso'}
            </button>
          </>
        )}

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
