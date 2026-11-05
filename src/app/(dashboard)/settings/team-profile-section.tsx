'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { updateTenantName, updateTenantLogo, removeTenantLogo } from './actions'
import { INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, CARD, CARD_HEADER } from './settings-styles'

// ─── Tenant profile section ───────────────────────────────────────────────────

export function TenantSection({ tenant, canManage }: { tenant: { id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null }; canManage: boolean }) {
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
