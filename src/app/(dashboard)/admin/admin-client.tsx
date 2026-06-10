'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TenantWithOwner } from '@/lib/data/tenants'
import { createTenant, provisionOwner } from './actions'

// ─── Style constants (consistent with Settings) ──────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '9px 12px', fontSize: '13px', color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box',
}
const LABEL: React.CSSProperties = {
  fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: '6px', display: 'block',
}
const BTN_PRIMARY: React.CSSProperties = {
  padding: '8px 18px', fontSize: '13px', fontWeight: 500, color: 'var(--bg-base)',
  background: 'var(--accent-gold)', border: 'none', borderRadius: '8px', cursor: 'pointer',
}
const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
  borderRadius: '12px', overflow: 'hidden',
}
const CARD_HEADER: React.CSSProperties = {
  padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)',
  fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)',
}
const ERROR: React.CSSProperties = { fontSize: '12px', color: 'var(--accent-coral)', marginTop: '8px' }
const OK: React.CSSProperties = { fontSize: '12px', color: 'var(--accent-green)', marginTop: '8px' }

function slugify(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}

// ─── Create tenant ──────────────────────────────────────────────────────────

function CreateTenantCard() {
  const router = useRouter()
  const [name, setName]   = useState('')
  const [slug, setSlug]   = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [color, setColor] = useState('#1E3A5F')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const effectiveSlug = slugTouched ? slug : slugify(name)

  function handleCreate() {
    setError(null); setOk(null)
    startTransition(async () => {
      const res = await createTenant({ name, slug: effectiveSlug, primaryColor: color })
      if (!res.ok) { setError(res.error); return }
      setOk(`Tenant creado: ${res.id}`)
      setName(''); setSlug(''); setSlugTouched(false); setColor('#1E3A5F')
      router.refresh()
    })
  }

  return (
    <div style={CARD}>
      <div style={CARD_HEADER}>Crear tenant</div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <label style={LABEL}>Nombre</label>
          <input style={INPUT} value={name} onChange={e => setName(e.target.value)} placeholder="A&J Real Estate Group" />
        </div>
        <div>
          <label style={LABEL}>Slug</label>
          <input
            style={INPUT}
            value={effectiveSlug}
            onChange={e => { setSlug(e.target.value); setSlugTouched(true) }}
            placeholder="aj-real-estate"
          />
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
            id del tenant: <code>tenant-{effectiveSlug || '…'}</code>
          </div>
        </div>
        <div>
          <label style={LABEL}>Color primario</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input type="color" value={color} onChange={e => setColor(e.target.value)}
              style={{ width: '40px', height: '36px', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer' }} />
            <input style={{ ...INPUT, width: '120px' }} value={color} onChange={e => setColor(e.target.value)} />
          </div>
        </div>
        <div>
          <button style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }} disabled={pending} onClick={handleCreate}>
            {pending ? 'Creando…' : 'Crear tenant'}
          </button>
          {error && <div style={ERROR}>{error}</div>}
          {ok && <div style={OK}>{ok}</div>}
        </div>
      </div>
    </div>
  )
}

// ─── Provision owner (inline, per ownerless tenant) ───────────────────────────

function ProvisionOwnerForm({ tenantId }: { tenantId: string }) {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [telegram, setTelegram] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [ok, setOk]             = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleProvision() {
    setError(null); setOk(null)
    startTransition(async () => {
      const res = await provisionOwner({ tenantId, email, telegramChatId: telegram || undefined })
      if (!res.ok) { setError(res.error); return }
      setOk(`Listo. ${res.email} puede entrar en app.itmano.com con Magic Link.`)
      router.refresh()
    })
  }

  if (ok) return <div style={OK}>{ok}</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <input style={{ ...INPUT, flex: '1 1 220px' }} type="email" value={email}
          onChange={e => setEmail(e.target.value)} placeholder="owner@email.com" />
        <input style={{ ...INPUT, flex: '1 1 160px' }} value={telegram}
          onChange={e => setTelegram(e.target.value)} placeholder="Telegram chat id (opcional)" />
        <button style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }} disabled={pending} onClick={handleProvision}>
          {pending ? 'Provisionando…' : 'Provisionar owner'}
        </button>
      </div>
      {error && <div style={ERROR}>{error}</div>}
    </div>
  )
}

// ─── Tenant list ──────────────────────────────────────────────────────────────

export function AdminClient({ tenants }: { tenants: TenantWithOwner[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '720px' }}>
      <CreateTenantCard />

      <div style={CARD}>
        <div style={CARD_HEADER}>Tenants · {tenants.length}</div>
        <div>
          {tenants.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No hay tenants todavía
            </div>
          ) : (
            tenants.map((t, i) => (
              <div key={t.id} style={{ padding: '16px 20px', borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: t.primaryColor, border: '1px solid var(--border-subtle)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{t.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.slug} · {t.id}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {t.ownerEmail ? (
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{t.ownerEmail}</span>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--accent-coral)' }}>Sin owner</span>
                    )}
                  </div>
                </div>
                {!t.ownerEmail && <ProvisionOwnerForm tenantId={t.id} />}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
