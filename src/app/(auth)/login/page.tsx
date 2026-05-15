'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
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

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="tu@email.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="••••••••"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontSize: '12px', color: '#E05C5C', textAlign: 'center' }}>
            {error}
          </div>
        )}

        {/* CTA */}
        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%',
            padding: '11px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: loading ? 'var(--accent-gold-dim)' : 'var(--accent-gold)',
            color: '#0B0C0E',
            fontSize: '13px',
            fontWeight: '600',
            letterSpacing: '0.06em',
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'background-color 0.15s',
          }}
        >
          {loading ? 'Verificando...' : 'Entrar'}
        </button>

        <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
          ITMANO CRM · A&amp;J Real Estate Group
        </div>
      </div>
    </div>
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
