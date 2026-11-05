'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, AlertCircle, Check } from 'lucide-react'
import { updateTenantName, updateTenantLogo, removeTenantLogo } from './actions'
import { SettingsCard, SettingsRow, SettingsSectionHead } from '@/components/ui/settings-row'
import { InfoHint } from '@/components/ui/info-hint'

// ─── Perfil del equipo ────────────────────────────────────────────────────────

export function TenantSection({ tenant, canManage }: { tenant: { id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null }; canManage: boolean }) {
  const router = useRouter()
  // `saved` es el último valor confirmado por el servidor: Cancelar vuelve a él
  // y la barra de guardado sólo se activa cuando el campo difiere de él.
  const [saved, setSaved]       = useState(tenant.name)
  const [name, setName]         = useState(tenant.name)
  const [error, setError]       = useState<string | null>(null)
  const [justSaved, setJustSaved] = useState(false)
  const [pending, startTransition] = useTransition()
  const dirty = name.trim() !== saved

  // Logo — se aplica al instante (independiente del nombre).
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [logoPending, startLogo]  = useTransition()

  function handleSave() {
    setError(null)
    setJustSaved(false)
    startTransition(async () => {
      const res = await updateTenantName(name)
      if (!res.ok) { setError(res.error); return }
      const next = name.trim()
      setSaved(next)
      setName(next)
      setJustSaved(true)
    })
  }

  function handleCancel() {
    setName(saved)
    setError(null)
    setJustSaved(false)
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
    <div>
      <SettingsSectionHead title="Perfil del equipo" description="Así te ven tus leads en correos y páginas." />
      <div className="settings-stack">
        <SettingsCard title="Marca">
          {/* Logo del equipo — visible para todos; editable para owner/super */}
          <SettingsRow label="Logo">
            <div className="settings-inline">
              {tenant.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="settings-logo-preview" src={tenant.logoUrl} alt={`Logo de ${tenant.name}`} />
              ) : (
                <div className="settings-logo-empty">
                  <Building2 size={15} strokeWidth={1.6} aria-hidden="true" /> Sin logo — el menú muestra un marcador
                </div>
              )}
              {canManage && (
                <>
                  <button type="button" className="btn btn-ghost" onClick={() => logoInputRef.current?.click()} disabled={logoPending}>
                    {logoPending ? 'Subiendo…' : tenant.logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  {tenant.logoUrl && (
                    <button type="button" className="btn btn-ghost" onClick={handleLogoRemove} disabled={logoPending}>
                      Quitar
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={e => handleLogoChange(e.target.files?.[0] ?? null)}
                    hidden
                    aria-label="Archivo del logo"
                  />
                </>
              )}
              <InfoHint label="Formatos del logo">
                Se muestra en el menú lateral del CRM. PNG, JPG, WebP o SVG · máx. 2 MB.
              </InfoHint>
            </div>
            {logoError && (
              <p className="settings-alert settings-alert-gap" role="alert">
                <AlertCircle size={13} aria-hidden="true" /> {logoError}
              </p>
            )}
          </SettingsRow>

          {/* Color (sólo lectura) */}
          <SettingsRow label="Color principal">
            <div className="settings-inline">
              <span className="settings-swatch" style={{ background: tenant.primaryColor }} aria-hidden="true" />
              <span className="settings-value-mono">{tenant.primaryColor}</span>
            </div>
          </SettingsRow>
        </SettingsCard>

        <SettingsCard title="Datos">
          <SettingsRow label="Nombre del equipo" htmlFor="tenant-name">
            {canManage ? (
              <input
                id="tenant-name"
                className="settings-input"
                value={name}
                onChange={e => { setName(e.target.value); setJustSaved(false) }}
                disabled={pending}
              />
            ) : (
              <span className="settings-value">{tenant.name}</span>
            )}
          </SettingsRow>

          {/* Slug (sólo lectura) */}
          <SettingsRow label="Slug">
            <div className="settings-inline">
              <span className="settings-value-mono">{tenant.slug}</span>
              <InfoHint label="Para qué sirve el slug">
                Identificador del equipo en las direcciones de tus páginas. No se puede cambiar desde aquí.
              </InfoHint>
            </div>
          </SettingsRow>

          {error && (
            <p className="settings-alert" role="alert">
              <AlertCircle size={13} aria-hidden="true" /> {error}
            </p>
          )}

          {canManage && (
            <div className="settings-savebar">
              {justSaved && !dirty && (
                <span className="settings-success settings-savebar-status" role="status">
                  <Check size={13} aria-hidden="true" /> Cambios guardados
                </span>
              )}
              <button type="button" className="btn btn-ghost" onClick={handleCancel} disabled={!dirty || pending}>
                Cancelar
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!dirty || pending}>
                {pending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          )}
        </SettingsCard>
      </div>
    </div>
  )
}
