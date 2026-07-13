'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import type { TenantWithOwner } from '@/lib/data/tenants'
import { createTenant, updateTenant, deleteTenant, provisionOwner } from './actions'
import { updateTenantLogo, removeTenantLogo } from '../settings/actions'

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

// Miniatura del logo del tenant (o placeholder) para listas del admin.
function LogoThumb({ logoUrl, name }: { logoUrl: string | null; name: string }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={`Logo de ${name}`}
        style={{
          width: '36px', height: '36px', objectFit: 'contain', flexShrink: 0,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          borderRadius: '8px', padding: '3px', boxSizing: 'border-box',
        }}
      />
    )
  }
  return (
    <div style={{
      width: '36px', height: '36px', borderRadius: '8px', flexShrink: 0,
      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
    }}>
      <Building2 size={15} strokeWidth={1.6} />
    </div>
  )
}

const LOGO_ACCEPT = 'image/png,image/jpeg,image/webp,image/svg+xml'

function CreateTenantCard() {
  const router = useRouter()
  const [name, setName]   = useState('')
  const [slug, setSlug]   = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [color, setColor] = useState('#1E3A5F')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const effectiveSlug = slugTouched ? slug : slugify(name)

  function handleCreate() {
    setError(null); setOk(null)
    startTransition(async () => {
      const res = await createTenant({ name, slug: effectiveSlug, primaryColor: color })
      if (!res.ok) { setError(res.error); return }

      // El logo se sube después de crear la fila (la carpeta de Storage se
      // nombra por tenant id). Si falla, el tenant ya existe — se avisa y el
      // logo puede subirse luego desde el listado.
      let logoNote = ''
      if (logoFile) {
        const fd = new FormData()
        fd.set('tenantId', res.id)
        fd.set('file', logoFile)
        const logoRes = await updateTenantLogo(fd)
        if (!logoRes.ok) logoNote = ` (el logo no se pudo subir: ${logoRes.error})`
      }

      setOk(`Tenant creado: ${res.id}${logoNote}`)
      setName(''); setSlug(''); setSlugTouched(false); setColor('#1E3A5F')
      setLogoFile(null)
      if (logoInputRef.current) logoInputRef.current.value = ''
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
          <label style={LABEL}>Logo (opcional)</label>
          <input
            ref={logoInputRef}
            type="file"
            accept={LOGO_ACCEPT}
            onChange={e => setLogoFile(e.target.files?.[0] ?? null)}
            style={{ ...INPUT, padding: '7px 12px', cursor: 'pointer' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
            PNG, JPG, WebP o SVG · máx. 2 MB. Se muestra en el menú lateral del CRM del tenant.
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

// ─── Tenant row (read / edit / delete) ────────────────────────────────────────

const BTN_GHOST: React.CSSProperties = {
  padding: '6px 12px', fontSize: '12px', color: 'var(--text-muted)',
  background: 'transparent', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', cursor: 'pointer',
}

function TenantRow({ tenant, isFirst }: { tenant: TenantWithOwner; isFirst: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<'view' | 'edit' | 'confirmDelete'>('view')
  const [name, setName]   = useState(tenant.name)
  const [color, setColor] = useState(tenant.primaryColor)
  const [confirmSlug, setConfirmSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const logoInputRef = useRef<HTMLInputElement>(null)

  function resetToView() {
    setMode('view'); setError(null)
    setName(tenant.name); setColor(tenant.primaryColor); setConfirmSlug('')
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateTenant({ tenantId: tenant.id, name, primaryColor: color })
      if (!res.ok) { setError(res.error); return }
      setMode('view')
      router.refresh()
    })
  }

  function handleLogoChange(file: File | null) {
    if (!file) return
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('tenantId', tenant.id)
      fd.set('file', file)
      const res = await updateTenantLogo(fd)
      if (logoInputRef.current) logoInputRef.current.value = ''
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  function handleLogoRemove() {
    setError(null)
    startTransition(async () => {
      const res = await removeTenantLogo(tenant.id)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteTenant(tenant.id, confirmSlug)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div style={{ padding: '16px 20px', borderTop: isFirst ? 'none' : '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <LogoThumb logoUrl={tenant.logoUrl} name={tenant.name} />
        <span style={{ width: '14px', height: '14px', borderRadius: '4px', background: tenant.primaryColor, border: '1px solid var(--border-subtle)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{tenant.name}</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{tenant.slug} · {tenant.id}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          {tenant.ownerEmail ? (
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{tenant.ownerEmail}</span>
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--accent-coral)' }}>Sin owner</span>
          )}
        </div>
        {mode === 'view' && (
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button
              style={BTN_GHOST}
              onClick={() => { setName(tenant.name); setColor(tenant.primaryColor); setMode('edit') }}
            >
              Editar
            </button>
            <button
              style={{ ...BTN_GHOST, color: 'var(--accent-coral)', borderColor: 'rgba(224,64,64,0.35)' }}
              onClick={() => { setMode('confirmDelete'); setConfirmSlug('') }}
            >
              Eliminar
            </button>
          </div>
        )}
      </div>

      {/* Edición: nombre, color y logo */}
      {mode === 'edit' && (
        <div style={{ marginTop: '14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px' }}>
              <label style={LABEL}>Nombre</label>
              <input style={INPUT} value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label style={LABEL}>Color primario</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="color" value={color} onChange={e => setColor(e.target.value)}
                  style={{ width: '40px', height: '36px', background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer' }} />
                <input style={{ ...INPUT, width: '110px', fontFamily: 'monospace' }} value={color} onChange={e => setColor(e.target.value)} maxLength={7} />
              </div>
            </div>
          </div>
          <div>
            <label style={LABEL}>Logo</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <LogoThumb logoUrl={tenant.logoUrl} name={tenant.name} />
              <input
                ref={logoInputRef}
                type="file"
                accept={LOGO_ACCEPT}
                onChange={e => handleLogoChange(e.target.files?.[0] ?? null)}
                style={{ ...INPUT, flex: '1 1 220px', padding: '7px 12px', cursor: 'pointer' }}
              />
              {tenant.logoUrl && (
                <button style={BTN_GHOST} disabled={pending} onClick={handleLogoRemove}>Quitar logo</button>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              PNG, JPG, WebP o SVG · máx. 2 MB. El cambio de logo se aplica al instante.
            </div>
          </div>
          {error && <div style={ERROR}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }} disabled={pending} onClick={handleSave}>
              {pending ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button style={BTN_GHOST} onClick={resetToView}>Cancelar</button>
          </div>
        </div>
      )}

      {/* Confirmación de eliminación — requiere teclear el slug exacto */}
      {mode === 'confirmDelete' && (
        <div style={{ marginTop: '14px', background: 'rgba(224,64,64,0.06)', border: '1px solid rgba(224,64,64,0.25)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
            Esta acción elimina el tenant <strong>{tenant.name}</strong> de forma permanente.
            Si tiene datos operativos (leads, agentes, canales…), la base de datos rechazará el borrado.
            Escribe <code style={{ color: 'var(--accent-coral)' }}>{tenant.slug}</code> para confirmar.
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              style={{ ...INPUT, flex: '1 1 200px', fontFamily: 'monospace' }}
              value={confirmSlug}
              onChange={e => setConfirmSlug(e.target.value)}
              placeholder={tenant.slug}
            />
            <button
              style={{ ...BTN_PRIMARY, background: '#E04040', opacity: pending || confirmSlug.trim() !== tenant.slug ? 0.6 : 1 }}
              disabled={pending || confirmSlug.trim() !== tenant.slug}
              onClick={handleDelete}
            >
              {pending ? 'Eliminando…' : 'Eliminar tenant'}
            </button>
            <button style={BTN_GHOST} onClick={resetToView}>Cancelar</button>
          </div>
          {error && <div style={ERROR}>{error}</div>}
        </div>
      )}

      {!tenant.ownerEmail && mode === 'view' && <ProvisionOwnerForm tenantId={tenant.id} />}
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
            tenants.map((t, i) => <TenantRow key={t.id} tenant={t} isFirst={i === 0} />)
          )}
        </div>
      </div>
    </div>
  )
}
