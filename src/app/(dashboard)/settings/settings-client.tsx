'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import type { Agent } from '@/lib/types'
import type { TenantRole } from '@/lib/auth/tenant-context'
import type { ScoreRule } from '@/lib/data/score-rules'
import type { AiUsageSummary } from '@/lib/data/ai-usage'
import { AiUsagePanel, type AiUsageLimitView } from '@/components/dashboard/ai-usage-panel'
import type { AgentAiBreakdown } from '@/lib/data/ai-usage'
import { AiCapacityRequest } from './ai-capacity-request'
import { updateTenantName, updateTenantLogo, removeTenantLogo, updateAgent, createAgent, inviteAgentAccess, revokeAgentAccess, linkAgentToMyAccount, updateAgentSignature, updateAgentLanguages, requestSubscriptionChange, requestSubscriptionCancel, withdrawSubscriptionRequest } from './actions'
import { PLAN_CONFIG, PLAN_ORDER, SUBSCRIPTION_STATUS_LABELS, type TenantSubscription, type SubscriptionPlan } from '@/lib/subscriptions'
import { trialDaysLeft } from '@/lib/plans'
import { ScoringSection } from './scoring-section'
import { Tabs } from '@/components/ui/tabs'

const ROLE_LABELS: Record<TenantRole, string> = {
  super_admin: 'Administrador ITMANO',
  agent_owner: 'Propietario',
  agent:       'Agente',
}

const SPECIALTY_OPTIONS = [
  { value: 'hispanic',    label: 'Mercado Hispano' },
  { value: 'military',    label: 'Compradores Militares' },
  { value: 'first_buyer', label: 'Primer Comprador' },
  { value: 'brazilian',   label: 'Mercado Brasileño' },
]

const LANGUAGE_OPTIONS = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
  { value: 'pt', label: 'Português' },
]

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

function TenantSection({ tenant, canManage }: { tenant: { id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null }; canManage: boolean }) {
  const router = useRouter()
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(tenant.name)
  const [error, setError]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Logo — se aplica al instante (independiente del modo edición del nombre).
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoPending, startLogo]  = useTransition()

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateTenantName(name)
      if (!res.ok) { setError(res.error); return }
      setEditing(false)
    })
  }

  function handleLogoChange(file: File | null) {
    if (!file) return
    setLogoError(null)
    startLogo(async () => {
      const fd = new FormData()
      fd.set('file', file)
      const res = await updateTenantLogo(fd)
      if (logoInputRef.current) logoInputRef.current.value = ''
      if (!res.ok) { setLogoError(res.error); return }
      router.refresh()
    })
  }

  function handleLogoRemove() {
    setLogoError(null)
    startLogo(async () => {
      const res = await removeTenantLogo()
      if (!res.ok) { setLogoError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div style={CARD}>
      <div style={{ ...CARD_HEADER, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Perfil del equipo</span>
        {canManage && !editing && (
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

        {/* Logo del equipo — visible para todos; editable para owner/super */}
        <div>
          <label style={LABEL}>Logo del equipo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logoUrl}
                alt={`Logo de ${tenant.name}`}
                style={{
                  maxWidth: '140px', maxHeight: '52px', objectFit: 'contain',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  borderRadius: '8px', padding: '6px', boxSizing: 'content-box',
                }}
              />
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px',
                background: 'var(--bg-elevated)', border: '1px dashed var(--border-subtle)',
                borderRadius: '8px', color: 'var(--text-muted)', fontSize: '12px',
              }}>
                <Building2 size={15} strokeWidth={1.6} /> Sin logo — el menú muestra un marcador
              </div>
            )}
            {canManage && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoPending}
                  style={{ ...BTN_GHOST, opacity: logoPending ? 0.6 : 1 }}
                >
                  {logoPending ? 'Subiendo…' : tenant.logoUrl ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {tenant.logoUrl && (
                  <button onClick={handleLogoRemove} disabled={logoPending} style={BTN_GHOST}>
                    Quitar
                  </button>
                )}
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  onChange={e => handleLogoChange(e.target.files?.[0] ?? null)}
                  style={{ display: 'none' }}
                />
              </div>
            )}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Se muestra en el menú lateral del CRM. PNG, JPG, WebP o SVG · máx. 2 MB.
          </div>
          {logoError && <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px', marginTop: '8px' }}>{logoError}</div>}
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

function AgentRow({ agent, hasAccess, canManage, canLinkSelf, canEditLanguages }: { agent: Agent; hasAccess: boolean; canManage: boolean; canLinkSelf: boolean; canEditLanguages: boolean }) {
  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(agent.name)
  const [email, setEmail]       = useState(agent.email ?? '')
  const [phone, setPhone]       = useState(agent.phone ?? '')
  const [color, setColor]       = useState(agent.accentColor)
  const [initials, setInitials] = useState(agent.avatarInitials)
  const [error, setError]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Login-access UI state (invite / revoke)
  const [accessMode, setAccessMode]   = useState<'idle' | 'inviting' | 'confirmRevoke'>('idle')
  const [inviteEmail, setInviteEmail] = useState(agent.email ?? '')
  const [accessMsg, setAccessMsg]     = useState<string | null>(null)
  const [accessErr, setAccessErr]     = useState<string | null>(null)
  const [accessPending, startAccess]  = useTransition()

  // Idiomas registrados (definen los emails de cierre del agente — 058).
  const [editingLangs, setEditingLangs] = useState(false)
  const [langs, setLangs]               = useState<string[]>(agent.languages)
  const [langsSaved, setLangsSaved]     = useState<string[]>(agent.languages)
  const [langErr, setLangErr]           = useState<string | null>(null)
  const [langOk, setLangOk]             = useState(false)
  const [langPending, startLangs]       = useTransition()

  function toggleLang(l: string) {
    if (l === agent.language) return // el principal (ruteo) no se desmarca
    setLangs(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])
  }

  function handleSaveLangs() {
    setLangErr(null); setLangOk(false)
    startLangs(async () => {
      const res = await updateAgentLanguages(agent.id, langs)
      if (!res.ok) { setLangErr(res.error); return }
      setLangsSaved(langs)
      setEditingLangs(false)
      setLangOk(true)
      setTimeout(() => setLangOk(false), 2500)
    })
  }

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

  function handleInvite() {
    setAccessErr(null); setAccessMsg(null)
    startAccess(async () => {
      const res = await inviteAgentAccess(agent.id, inviteEmail)
      if (!res.ok) { setAccessErr(res.error); return }
      setAccessMsg(`Listo. ${res.email} ya puede entrar en app.itmano.com con su correo (Magic Link).`)
      setAccessMode('idle')
    })
  }

  function handleRevoke() {
    setAccessErr(null); setAccessMsg(null)
    startAccess(async () => {
      const res = await revokeAgentAccess(agent.id)
      if (!res.ok) { setAccessErr(res.error); return }
      setAccessMode('idle')
    })
  }

  function handleLinkSelf() {
    setAccessErr(null); setAccessMsg(null)
    startAccess(async () => {
      const res = await linkAgentToMyAccount(agent.id)
      if (!res.ok) { setAccessErr(res.error); return }
      setAccessMsg(`Vinculado. Ahora figuras como ${agent.name} (p. ej. para importar leads).`)
    })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px' }}>
      {!editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
              {SPECIALTY_LABELS[agent.specialty] ?? agent.specialty}
              {' · '}
              {langsSaved.map(l => LANGUAGE_LABELS[l] ?? l).join(', ')}
            </div>
          </div>

          {/* Access status badge */}
          <span style={{
            fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: hasAccess ? 'var(--accent-green)' : 'var(--text-muted)',
            background: hasAccess ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
          }}>
            {hasAccess ? 'Con acceso' : 'Sin acceso'}
          </span>

          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {canEditLanguages && (
              <button onClick={() => { setEditingLangs(v => !v); setLangs(langsSaved); setLangErr(null) }} style={BTN_GHOST}>Idiomas</button>
            )}
            {canManage && (
              <>
                {hasAccess ? (
                  <button onClick={() => { setAccessMode('confirmRevoke'); setAccessErr(null) }} style={BTN_GHOST}>Revocar acceso</button>
                ) : (
                  <>
                    {canLinkSelf && (
                      <button onClick={handleLinkSelf} disabled={accessPending} style={BTN_GHOST}>Vincular a mi cuenta</button>
                    )}
                    <button onClick={() => { setInviteEmail(agent.email ?? ''); setAccessMode('inviting'); setAccessErr(null); setAccessMsg(null) }} style={BTN_GHOST}>Invitar acceso</button>
                  </>
                )}
                <button onClick={() => setEditing(true)} style={BTN_GHOST}>Editar</button>
              </>
            )}
          </div>
        </div>

        {/* Panel de idiomas registrados */}
        {editingLangs && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>Idiomas que atiende</label>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              {LANGUAGE_OPTIONS.map(o => {
                const isPrimary = o.value === agent.language
                const checked = langs.includes(o.value)
                return (
                  <label key={o.value} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: isPrimary ? 'default' : 'pointer', opacity: isPrimary ? 0.8 : 1 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPrimary}
                      onChange={() => toggleLang(o.value)}
                      style={{ accentColor: 'var(--accent-gold)' }}
                    />
                    {o.label}
                    {isPrimary && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(principal)</span>}
                  </label>
                )
              })}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Cada idioma registrado agrega los 3 emails de cierre del agente en ese idioma
              (sección Emails de cierre). El idioma principal define el ruteo de leads y no puede quitarse.
            </div>
            {langErr && <div style={{ fontSize: '12px', color: '#E04040' }}>{langErr}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSaveLangs} disabled={langPending} style={{ ...BTN_PRIMARY, opacity: langPending ? 0.6 : 1 }}>
                {langPending ? 'Guardando…' : 'Guardar idiomas'}
              </button>
              <button onClick={() => { setEditingLangs(false); setLangs(langsSaved); setLangErr(null) }} style={BTN_GHOST}>Cancelar</button>
            </div>
          </div>
        )}
        {langOk && (
          <div style={{ fontSize: '12px', color: 'var(--accent-green)', background: 'rgba(107,163,104,0.10)', border: '1px solid rgba(107,163,104,0.25)', borderRadius: '8px', padding: '10px 12px' }}>
            Idiomas guardados. Sus emails de cierre ya están disponibles en la sección Emails.
          </div>
        )}

        {/* Invite panel */}
        {accessMode === 'inviting' && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={LABEL}>Email de acceso del agente</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input style={{ ...INPUT, flex: '1 1 220px' }} type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="agente@email.com" />
              <button onClick={handleInvite} disabled={accessPending} style={{ ...BTN_PRIMARY, opacity: accessPending ? 0.6 : 1 }}>
                {accessPending ? 'Invitando…' : 'Enviar invitación'}
              </button>
              <button onClick={() => { setAccessMode('idle'); setAccessErr(null) }} style={BTN_GHOST}>Cancelar</button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              No se envía email automático — comparte el mensaje de confirmación con el agente.
            </div>
          </div>
        )}

        {/* Revoke confirm panel */}
        {accessMode === 'confirmRevoke' && (
          <div style={{ background: 'rgba(224,64,64,0.06)', border: '1px solid rgba(224,64,64,0.25)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              ¿Revocar el acceso de <strong>{agent.name}</strong>? Pierde el acceso de inmediato; sus leads atribuidos NO se tocan.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleRevoke} disabled={accessPending} style={{ ...BTN_PRIMARY, background: '#E04040', opacity: accessPending ? 0.6 : 1 }}>
                {accessPending ? 'Revocando…' : 'Sí, revocar acceso'}
              </button>
              <button onClick={() => setAccessMode('idle')} style={BTN_GHOST}>Cancelar</button>
            </div>
          </div>
        )}

        {accessMsg && (
          <div style={{ fontSize: '12px', color: 'var(--accent-green)', background: 'rgba(107,163,104,0.10)', border: '1px solid rgba(107,163,104,0.25)', borderRadius: '8px', padding: '10px 12px' }}>
            {accessMsg}
          </div>
        )}
        {accessErr && (
          <div style={{ fontSize: '12px', color: '#E04040', background: 'rgba(224,64,64,0.08)', borderRadius: '8px', padding: '8px 12px' }}>
            {accessErr}
          </div>
        )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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

// ─── Create agent form ────────────────────────────────────────────────────────

function CreateAgentForm({ tenantId, onDone }: { tenantId?: string; onDone: () => void }) {
  const [name, setName]         = useState('')
  const [email, setEmail]       = useState('')
  const [phone, setPhone]       = useState('')
  const [language, setLanguage] = useState('es')
  const [specialty, setSpecialty] = useState('hispanic')
  const [initials, setInitials] = useState('')
  const [color, setColor]       = useState('#5B8EC9')
  const [error, setError]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleCreate() {
    setError(null)
    startTransition(async () => {
      const res = await createAgent({
        name, email, phone, language, specialty,
        avatarInitials: initials || name.trim().slice(0, 2).toUpperCase(),
        accentColor: color, tenantId,
      })
      if (!res.ok) { setError(res.error); return }
      onDone()
    })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '20px', background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
        <div>
          <label style={LABEL}>Nombre</label>
          <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="John Leonard" />
        </div>
        <div>
          <label style={LABEL}>Iniciales del avatar</label>
          <input value={initials} onChange={e => setInitials(e.target.value)} style={INPUT} maxLength={2} placeholder="JL" />
        </div>
        <div>
          <label style={LABEL}>Email</label>
          <input value={email} onChange={e => setEmail(e.target.value)} style={INPUT} type="email" placeholder="agente@email.com" />
        </div>
        <div>
          <label style={LABEL}>Teléfono (opcional)</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={LABEL}>Idioma</label>
          <select value={language} onChange={e => setLanguage(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
            {LANGUAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL}>Especialidad</label>
          <select value={specialty} onChange={e => setSpecialty(e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
            {SPECIALTY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label style={LABEL}>Color de acento</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: '40px', height: '36px', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', cursor: 'pointer' }} />
            <input value={color} onChange={e => setColor(e.target.value)} style={{ ...INPUT, flex: 1, fontFamily: 'monospace' }} maxLength={7} />
          </div>
        </div>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
        Idioma y especialidad definen el ruteo automático de leads. El acceso de login se otorga después con &quot;Invitar acceso&quot;.
      </div>

      {error && <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px', marginTop: '10px' }}>{error}</div>}

      <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
        <button onClick={handleCreate} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Creando…' : 'Crear agente'}
        </button>
        <button onClick={onDone} style={BTN_GHOST}>Cancelar</button>
      </div>
    </div>
  )
}

// ─── Agents section ───────────────────────────────────────────────────────────

function AgentsSection({
  agents, agentAccess, accessCount, canManage, canLinkSelf, tenantId, isSuper, myAgentId,
}: {
  agents: Agent[]
  agentAccess: Record<string, boolean>
  accessCount: number
  canManage: boolean
  canLinkSelf: boolean
  tenantId: string
  isSuper: boolean
  myAgentId: string | null
}) {
  const [creating, setCreating] = useState(false)

  return (
    <div style={CARD}>
      <div style={{ ...CARD_HEADER, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Agentes del equipo</span>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {agents.length} {agents.length === 1 ? 'miembro' : 'miembros'} · {accessCount} {accessCount === 1 ? 'acceso activo' : 'accesos activos'}
          </div>
        </div>
        {canManage && !creating && (
          <button onClick={() => setCreating(true)} style={BTN_PRIMARY}>Crear agente</button>
        )}
      </div>

      {creating && <CreateAgentForm tenantId={isSuper ? tenantId : undefined} onDone={() => setCreating(false)} />}

      {agents.map(agent => (
        <AgentRow
          key={agent.id}
          agent={agent}
          hasAccess={!!agentAccess[agent.id]}
          canManage={canManage}
          canLinkSelf={canLinkSelf}
          // Owner/super editan los idiomas de todos; un 'agent' solo los suyos.
          canEditLanguages={canManage || agent.id === myAgentId}
        />
      ))}
    </div>
  )
}

// ─── Email settings: firma por agente ─────────────────────────────────────────

function AgentSignatureRow({ agent, canManage }: { agent: Agent; canManage: boolean }) {
  const [value, setValue]   = useState(agent.emailSignature ?? '')
  const [saved, setSaved]   = useState<string>(agent.emailSignature ?? '')
  const [error, setError]   = useState<string | null>(null)
  const [ok, setOk]         = useState(false)
  const [pending, startTransition] = useTransition()

  const dirty = value !== saved

  function handleSave() {
    setError(null); setOk(false)
    startTransition(async () => {
      const res = await updateAgentSignature(agent.id, value)
      if (!res.ok) { setError(res.error); return }
      setSaved(value)
      setOk(true)
      setTimeout(() => setOk(false), 2000)
    })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: `${agent.accentColor}22`, border: `1px solid ${agent.accentColor}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: agent.accentColor, flexShrink: 0,
        }}>
          {agent.avatarInitials}
        </div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</div>
      </div>

      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setError(null) }}
        disabled={!canManage}
        rows={3}
        maxLength={600}
        placeholder={`Ej.:\nUn abrazo,\n${agent.name}`}
        style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, opacity: canManage ? 1 : 0.7 }}
      />

      {error && <div style={{ fontSize: '12px', color: '#E04040' }}>{error}</div>}

      {canManage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={handleSave} disabled={pending || !dirty} style={{ ...BTN_PRIMARY, opacity: pending || !dirty ? 0.5 : 1, cursor: pending || !dirty ? 'default' : 'pointer' }}>
            {pending ? 'Guardando…' : 'Guardar firma'}
          </button>
          {ok && <span style={{ fontSize: '12px', color: 'var(--accent-green)' }}>Firma guardada.</span>}
        </div>
      )}
    </div>
  )
}

function EmailSettingsSection({ agents, canManage }: { agents: Agent[]; canManage: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={CARD}>
        <div style={CARD_HEADER}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Firma de correo</span>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            La firma de cada agente se agrega automáticamente al final de todos los correos que se envían a sus
            leads (secuencias, hitos de compra y envíos puntuales). Escríbela en tono personal, como cerrarías
            un correo a un conocido.
          </div>
        </div>
        {agents.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No hay agentes todavía.
          </div>
        ) : (
          agents.map(agent => <AgentSignatureRow key={agent.id} agent={agent} canManage={canManage} />)
        )}
      </div>
    </div>
  )
}

// ─── Subscription card ────────────────────────────────────────────────────────
// Sales-led: sin procesador de pagos todavía, el owner SOLICITA cambio o
// cancelación y el equipo ITMANO la procesa (se le notifica al instante).

function SubscriptionCard({ subscription, canManage }: {
  subscription: TenantSubscription | null
  canManage: boolean
}) {
  const [mode, setMode] = useState<'view' | 'changing' | 'confirmCancel'>('view')
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!subscription) {
    return (
      <div style={CARD}>
        <div style={CARD_HEADER}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Suscripción</span>
        </div>
        <div style={{ padding: '20px', fontSize: '13px', color: 'var(--text-muted)' }}>
          Este equipo no tiene una suscripción registrada. Contacta a ITMANO.
        </div>
      </div>
    )
  }

  const cfg = PLAN_CONFIG[subscription.plan]
  const hasPendingRequest = subscription.status === 'change_requested' || subscription.status === 'cancel_requested'

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    startTransition(async () => {
      const res = await action()
      if (!res.ok) { setError(res.error); return }
      setMode('view')
      setSelectedPlan(null)
    })
  }

  return (
    <div style={CARD}>
      <div style={{ ...CARD_HEADER, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Suscripción</span>
        <span style={{
          fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
          letterSpacing: '0.06em', textTransform: 'uppercase',
          color: subscription.status === 'active' ? 'var(--accent-green)'
               : subscription.status === 'cancelled' ? 'var(--accent-coral)'
               : 'var(--accent-gold)',
          background: subscription.status === 'active' ? 'rgba(107,163,104,0.12)'
                    : subscription.status === 'cancelled' ? 'rgba(201,123,107,0.12)'
                    : 'rgba(201,169,110,0.12)',
        }}>
          {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
        </span>
      </div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Plan {cfg.label}
          </div>
          <div style={{ fontSize: '13px', color: 'var(--accent-gold)', marginTop: '2px' }}>{cfg.inversion}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5 }}>{cfg.blurb}</div>
        </div>

        {subscription.status === 'trial' && subscription.trialEndsAt && (
          <div style={{ fontSize: '12px', color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: '8px', padding: '10px 12px', lineHeight: 1.5 }}>
            {trialDaysLeft(subscription.trialEndsAt) > 0 ? (
              <>Tu período de prueba termina el{' '}
                <strong>{new Date(subscription.trialEndsAt).toLocaleDateString('es', { day: 'numeric', month: 'long' })}</strong>
                {' '}({trialDaysLeft(subscription.trialEndsAt)} día{trialDaysLeft(subscription.trialEndsAt) === 1 ? '' : 's'} restante{trialDaysLeft(subscription.trialEndsAt) === 1 ? '' : 's'}).
                El equipo ITMANO te contactará para elegir tu plan definitivo.</>
            ) : (
              <>Tu período de prueba terminó. El equipo ITMANO te contactará para continuar — o escríbenos a customer@itmano.com.</>
            )}
          </div>
        )}

        {hasPendingRequest && (
          <div style={{ fontSize: '12px', color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: '8px', padding: '10px 12px', lineHeight: 1.5 }}>
            {subscription.status === 'change_requested' && subscription.requestedPlan
              ? <>Solicitaste cambiar al plan <strong>{PLAN_CONFIG[subscription.requestedPlan].label}</strong>. El equipo ITMANO te contactará para completar el cambio.</>
              : <>Solicitaste cancelar la suscripción. El equipo ITMANO te contactará para confirmarlo.</>}
            {canManage && (
              <button
                onClick={() => run(withdrawSubscriptionRequest)}
                disabled={pending}
                style={{ marginLeft: '10px', background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
              >
                Retirar solicitud
              </button>
            )}
          </div>
        )}

        {/* Selector de cambio de plan */}
        {mode === 'changing' && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={LABEL}>Elige el nuevo plan</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {PLAN_ORDER.filter(p => p !== subscription.plan).map(p => (
                <label key={p} style={{
                  display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px',
                  border: `1px solid ${selectedPlan === p ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                  borderRadius: '8px', cursor: 'pointer',
                  background: selectedPlan === p ? 'rgba(201,169,110,0.06)' : 'transparent',
                }}>
                  <input
                    type="radio"
                    name="plan"
                    checked={selectedPlan === p}
                    onChange={() => setSelectedPlan(p)}
                    style={{ marginTop: '2px', accentColor: 'var(--accent-gold)' }}
                  />
                  <span>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                      {PLAN_CONFIG[p].label}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--accent-gold)', marginLeft: '8px' }}>{PLAN_CONFIG[p].inversion}</span>
                    <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{PLAN_CONFIG[p].blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => selectedPlan && run(() => requestSubscriptionChange(selectedPlan))}
                disabled={pending || !selectedPlan}
                style={{ ...BTN_PRIMARY, opacity: pending || !selectedPlan ? 0.6 : 1 }}
              >
                {pending ? 'Enviando…' : 'Solicitar cambio'}
              </button>
              <button onClick={() => { setMode('view'); setSelectedPlan(null); setError(null) }} style={BTN_GHOST}>Cancelar</button>
            </div>
          </div>
        )}

        {/* Confirmación de cancelación */}
        {mode === 'confirmCancel' && (
          <div style={{ background: 'rgba(224,64,64,0.06)', border: '1px solid rgba(224,64,64,0.25)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
              ¿Solicitar la cancelación de tu suscripción? El equipo ITMANO te contactará para
              confirmarla. Tus datos no se eliminan al enviar la solicitud.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => run(requestSubscriptionCancel)}
                disabled={pending}
                style={{ ...BTN_PRIMARY, background: '#E04040', opacity: pending ? 0.6 : 1 }}
              >
                {pending ? 'Enviando…' : 'Sí, solicitar cancelación'}
              </button>
              <button onClick={() => { setMode('view'); setError(null) }} style={BTN_GHOST}>Volver</button>
            </div>
          </div>
        )}

        {error && <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>{error}</div>}

        {/* Acciones — solo owner/super y sin solicitud pendiente */}
        {canManage && mode === 'view' && !hasPendingRequest && subscription.status !== 'cancelled' && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={() => { setMode('changing'); setError(null) }} style={BTN_PRIMARY}>Cambiar de plan</button>
            <button onClick={() => { setMode('confirmCancel'); setError(null) }} style={{ ...BTN_GHOST, color: 'var(--accent-coral)', borderColor: 'rgba(224,64,64,0.3)' }}>
              Cancelar suscripción
            </button>
          </div>
        )}

        <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Los cambios de suscripción los gestiona el equipo ITMANO — al enviar una solicitud,
          te contactamos para completarla sin interrupciones en tu servicio.
        </div>
      </div>
    </div>
  )
}

// ─── Account section ──────────────────────────────────────────────────────────

function AccountSection({ userEmail, userRole, onGoToAgents, canManage }: {
  userEmail: string
  userRole: TenantRole
  onGoToAgents: () => void
  canManage: boolean
}) {
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

        {/* Login email — the real authenticated user */}
        <div>
          <label style={LABEL}>Email de acceso</label>
          <div style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '9px 0' }}>
            {userEmail || '—'}
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
              {ROLE_LABELS[userRole]}
            </span>
          </div>
        </div>

        {/* Team access management pointer */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {canManage ? (
              <>El acceso de login de los miembros del equipo se gestiona en el tab{' '}
                <button onClick={onGoToAgents} style={{ background: 'none', border: 'none', color: 'var(--accent-gold)', cursor: 'pointer', padding: 0, fontSize: '12px' }}>Agentes</button>.</>
            ) : (
              <>El acceso de login de los miembros del equipo lo gestiona el propietario de la cuenta.</>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main settings client ─────────────────────────────────────────────────────

type Tab = 'perfil' | 'agentes' | 'email' | 'scoring' | 'ia' | 'cuenta'

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'perfil',  label: 'Perfil del equipo' },
  { value: 'agentes', label: 'Agentes' },
  { value: 'email',   label: 'Email' },
  { value: 'scoring', label: 'Scoring' },
  { value: 'ia',      label: 'Uso de IA' },
  { value: 'cuenta',  label: 'Cuenta y acceso' },
]

interface Props {
  tenant: { id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null }
  agents: Agent[]
  agentAccess: Record<string, boolean>
  accessCount: number
  scoringRules: ScoreRule[]
  canEditScoring: boolean
  canManageAgents: boolean
  canLinkSelf: boolean
  myAgentId: string | null
  userEmail: string
  userRole: TenantRole
  aiUsage: AiUsageSummary
  aiShowCosts: boolean
  aiLimit: AiUsageLimitView | null
  aiLimitSubtitle?: string
  aiByAgent: AgentAiBreakdown | null
  subscription: TenantSubscription | null
}

export function SettingsClient({
  tenant, agents, agentAccess, accessCount, scoringRules,
  canEditScoring, canManageAgents, canLinkSelf, myAgentId, userEmail, userRole,
  aiUsage, aiShowCosts, aiLimit, aiLimitSubtitle, aiByAgent, subscription,
}: Props) {
  const [tab, setTab] = useState<Tab>('perfil')

  return (
    <Tabs
      items={TABS.map(t => ({ key: t.value, label: t.label }))}
      value={tab}
      onChange={k => setTab(k as Tab)}
      content={{
        perfil: <TenantSection tenant={tenant} canManage={canManageAgents} />,
        agentes: (
          <AgentsSection
            agents={agents}
            agentAccess={agentAccess}
            accessCount={accessCount}
            canManage={canManageAgents}
            canLinkSelf={canLinkSelf}
            tenantId={tenant.id}
            isSuper={userRole === 'super_admin'}
            myAgentId={myAgentId}
          />
        ),
        email: <EmailSettingsSection agents={agents} canManage={canManageAgents} />,
        scoring: <ScoringSection rules={scoringRules} canEdit={canEditScoring} />,
        ia: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {userRole === 'agent' ? (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                Estás viendo tu propia actividad de IA: tus requests y el porcentaje de tu
                parte del límite del equipo.
              </p>
            ) : userRole === 'agent_owner' && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, maxWidth: '460px' }}>
                  Uso de IA de tu equipo este mes. ¿Se está quedando corto el límite?
                  Solicita más capacidad y lo ampliamos.
                </p>
                <AiCapacityRequest />
              </div>
            )}
            <AiUsagePanel
              summary={aiUsage}
              showCosts={aiShowCosts}
              limit={aiLimit}
              limitSubtitle={aiLimitSubtitle}
              byAgent={aiByAgent}
            />
          </div>
        ),
        cuenta: (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <SubscriptionCard subscription={subscription} canManage={canManageAgents} />
            <AccountSection
              userEmail={userEmail}
              userRole={userRole}
              canManage={canManageAgents}
              onGoToAgents={() => setTab('agentes')}
            />
          </div>
        ),
      }}
    />
  )
}
