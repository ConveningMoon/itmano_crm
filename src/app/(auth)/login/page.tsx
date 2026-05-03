'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

const DEMO_ROLES = [
  { label: 'Adriana (agent_owner)', email: 'adriana.demo@example.com', role: 'agent_owner' },
  { label: 'Admin (super_admin)', email: 'admin.demo@example.com', role: 'super_admin' },
]

export default function LoginPage() {
  const router = useRouter()
  const [selectedRole, setSelectedRole] = useState(0)
  const [loading, setLoading] = useState(false)

  function handleLogin() {
    setLoading(true)
    setTimeout(() => router.push('/dashboard'), 400)
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

        {/* Role selector */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {DEMO_ROLES.map((role, i) => (
            <button
              key={role.role}
              onClick={() => setSelectedRole(i)}
              style={{
                flex: 1,
                padding: '8px 10px',
                borderRadius: '8px',
                fontSize: '11px',
                fontWeight: '500',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                border: '1px solid',
                transition: 'all 0.15s',
                borderColor: selectedRole === i ? 'var(--accent-gold)' : 'var(--border-subtle)',
                backgroundColor: selectedRole === i ? 'rgba(201,169,110,0.08)' : 'transparent',
                color: selectedRole === i ? 'var(--accent-gold)' : 'var(--text-secondary)',
              }}
            >
              {role.label}
            </button>
          ))}
        </div>

        {/* Fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              Email
            </label>
            <input
              type="email"
              readOnly
              value={DEMO_ROLES[selectedRole].email}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: '11px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '6px',
              }}
            >
              Contraseña
            </label>
            <input
              type="password"
              readOnly
              value=""
              placeholder="Sin verificación en esta demo"
              autoComplete="off"
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </div>

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
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <div
          style={{
            textAlign: 'center',
            fontSize: '11px',
            color: 'var(--text-muted)',
          }}
        >
          Demo — A&amp;J Real Estate Group
        </div>
      </div>
    </div>
  )
}
