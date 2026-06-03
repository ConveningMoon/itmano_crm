'use client'

import { useState, useTransition } from 'react'
import type { Agent } from '@/lib/types'
import type { ScoreRule } from '@/lib/data/score-rules'
import { updateTenantName, updateAgent } from './actions'
import { ScoringSection } from './scoring-section'

// ─── Style constants ──────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
  display: 'block',
}

const BTN_PRIMARY: React.CSSProperties = {
  padding: '8px 18px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--bg-base)',
  background: 'var(--accent-gold)',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
}

const BTN_GHOST: React.CSSProperties = {
  padding: '7px 14px',
  fontSize: '12px',
  color: 'var(--text-muted)',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  cursor: 'pointer',
}

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  overflow: 'hidden',
}

const CARD_HEADER: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid var(--border-subtle)',
}

// ─── Tenant profile section ───────────────────────────────────────────────────

function TenantSection({ tenant }: { tenant: { id: string; name: string; slug: string; primaryColor: string } }) {
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(tenant.name)
  const [error, setError]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateTenantName(name)
      if (!res.ok) { setError(res.error); return }
      setEditing(false)
    })
  }

  return (
    <div style={CARD}>
      <div style={{ ...CARD_HEADER, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Perfil del equipo</span>
        {!editing && (
          <button onClick={() => setEditing(true)} style={BTN_GHOST}>Editar</button>
        )}
      </div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Name */}
        <div>
          <label style={LABEL}>Nombre del equipo</label>
          {editing ? (
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              style={INPUT}
              autoFocus
            />
          ) : (
            <div style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '9px 0' }}>{tenant.name}</div>
          )}
        </div>

        {/* Slug (read-only) */}
        <div>
          <label style={LABEL}>Slug</label>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '9px 0', fontFamily: 'monospace' }}>
            {tenant.slug}
          </div>
        </div>

        {/* Color (read-only) */}
        <div>
          <label style={LABEL}>Color principal</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 0' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '4px', background: tenant.primaryColor, border: '1px solid var(--border-subtle)' }} />
            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{tenant.primaryColor}</span>
          </div>
        </div>

        {error && <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>{error}</div>}

        {editing && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSave} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button onClick={() => { setEditing(false); setName(tenant.name); setError(null) }} style={BTN_GHOST}>
              Cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Agent edit row ───────────────────────────────────────────────────────────

function AgentRow({ agent }: { agent: Agent }) {
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(agent.name)
  const [email, setEmail]       = useState(agent.email ?? '')
  const [phone, setPhone]       = useState(agent.phone ?? '')
  const [color, setColor]       = useState(agent.accentColor)
  const [initials, setInitials] = useState(agent.avatarInitials)
  const [error, setError]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const SPECIALTY_LABELS: Record<string, string> = {
    hispanic:    'Mercado Hispano',
    military:    'Compradores Militares',
    first_buyer: 'Primer Comprador',
    brazilian:   'Mercado Brasileño',
  }

  const LANGUAGE_LABELS: Record<string, string> = {
    es: 'Español',
    en: 'English',
    pt: 'Português',
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateAgent(agent.id, { name, email, phone, accentColor: color, avatarInitials: initials })
      if (!res.ok) { setError(res.error); return }
      setEditing(false)
    })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px' }}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Avatar */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: `${agent.accentColor}22`,
            border: `1px solid ${agent.accentColor}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
            color: agent.accentColor,
            flexShrink: 0,
          }}>
            {agent.avatarInitials}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '2px' }}>{agent.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {SPECIALTY_LABELS[agent.specialty] ?? agent.specialty} · {LANGUAGE_LABELS[agent.language] ?? agent.language}
            </div>
          </div>

          {/* Color dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: agent.accentColor }} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{agent.accentColor}</span>
          </div>

          <button onClick={() => setEditing(true)} style={{ ...BTN_GHOST, flexShrink: 0 }}>Editar</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <div>
              <label style={LABEL}>Nombre</label>
              <input value={name} onChange={e => setName(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Iniciales del avatar</label>
              <input value={initials} onChange={e => setInitials(e.target.value)} style={INPUT} maxLength={2} />
            </div>
            <div>
              <label style={LABEL}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} style={INPUT} type="email" />
            </div>
            <div>
              <label style={LABEL}>Teléfono</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Color de acento</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{ width: '40px', height: '36px', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', cursor: 'pointer' }}
                />
                <input value={color} onChange={e => setColor(e.target.value)} style={{ ...INPUT, flex: 1, fontFamily: 'monospace' }} maxLength={7} />
              </div>
            </div>
          </div>

          {error && <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSave} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
              {pending ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => { setEditing(false); setName(agent.name); setError(null) }} style={BTN_GHOST}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Agents section ───────────────────────────────────────────────────────────

function AgentsSection({ agents }: { agents: Agent[] }) {
  return (
    <div style={CARD}>
      <div style={CARD_HEADER}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Agentes del equipo</span>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {agents.length} miembros · 1 acceso de sesión activo
        </div>
      </div>
      {agents.map(agent => (
        <AgentRow key={agent.id} agent={agent} />
      ))}
    </div>
  )
}

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection() {
  return (
    <div style={CARD}>
      <div style={CARD_HEADER}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Cuenta y acceso</span>
      </div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Auth method */}
        <div>
          <label style={LABEL}>Método de autenticación</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '10px', fontWeight: 500, color: 'var(--accent-green)', background: 'rgba(107,163,104,0.12)', padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Magic Link
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              Sin contraseña — acceso por enlace de un solo uso al email
            </span>
          </div>
        </div>

        {/* Login email */}
        <div>
          <label style={LABEL}>Email de acceso</label>
          <div style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '9px 0' }}>
            adrysofirealestate@gmail.com
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            El enlace de acceso llega a este email. Para cambiarlo, contacta a soporte ITMANO.
          </div>
        </div>

        {/* Role */}
        <div>
          <label style={LABEL}>Rol</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '10px', fontWeight: 500, color: '#5B8EC9', background: 'rgba(91,142,201,0.12)', padding: '2px 8px', borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Agent Owner
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Acceso completo a los datos del equipo</span>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            La gestión de accesos adicionales por agente estará disponible en una próxima actualización.
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main settings client ─────────────────────────────────────────────────────

type Tab = 'perfil' | 'agentes' | 'scoring' | 'cuenta'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'perfil',  label: 'Perfil del equipo' },
  { value: 'agentes', label: 'Agentes' },
  { value: 'scoring', label: 'Scoring' },
  { value: 'cuenta',  label: 'Cuenta y acceso' },
]

interface Props {
  tenant: { id: string; name: string; slug: string; primaryColor: string }
  agents: Agent[]
  scoringRules: ScoreRule[]
  canEditScoring: boolean
}

export function SettingsClient({ tenant, agents, scoringRules, canEditScoring }: Props) {
  const [tab, setTab] = useState<Tab>('perfil')

  return (
    <div>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-subtle)', marginBottom: '24px' }}>
        {TABS.map(t => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            style={{
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: tab === t.value ? 500 : 400,
              color: tab === t.value ? 'var(--accent-gold)' : 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              borderBottom: tab === t.value ? '2px solid var(--accent-gold)' : '2px solid transparent',
              cursor: 'pointer',
              marginBottom: '-1px',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'perfil'  && <TenantSection tenant={tenant} />}
      {tab === 'agentes' && <AgentsSection agents={agents} />}
      {tab === 'scoring' && <ScoringSection rules={scoringRules} canEdit={canEditScoring} />}
      {tab === 'cuenta'  && <AccountSection />}
    </div>
  )
}
