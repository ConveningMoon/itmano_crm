'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
import type { TenantWithOwner } from '@/lib/data/tenants'
import { createTenant, updateTenant, deleteTenant, provisionOwner, updateTenantSubscription } from './actions'
import { updateTenantLogo, removeTenantLogo } from '../settings/actions'
import { PLAN_CONFIG, PLAN_ORDER, SUBSCRIPTION_STATUS_LABELS, type SubscriptionPlan, type SubscriptionStatus } from '@/lib/subscriptions'
import { TRIAL, trialDaysLeft, trialEndsAtFromNow } from '@/lib/plans'

// Estado editable del select de suscripción: las solicitudes pendientes
// (change/cancel_requested) se editan como 'active' — guardar las resuelve.
function editableStatus(status: string | null): 'trial' | 'active' | 'cancelled' {
  if (status === 'trial') return 'trial'
  if (status === 'cancelled') return 'cancelled'
  return 'active'
}

// Valor yyyy-mm-dd para <input type="date">; sin fecha previa, propone hoy+TRIAL.days.
function dateInputValue(iso: string | null): string {
  const d = iso ? new Date(iso) : trialEndsAtFromNow()
  const pad = (v: number) => String(v).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

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
  const [plan, setPlan]   = useState<SubscriptionPlan>('esencial')
  const [startTrial, setStartTrial] = useState(false)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const effectiveSlug = slugTouched ? slug : slugify(name)

  function handleCreate() {
    setError(null); setOk(null)
    startTransition(async () => {
      const res = await createTenant({ name, slug: effectiveSlug, primaryColor: color, plan, startTrial })
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
      setName(''); setSlug(''); setSlugTouched(false); setColor('#1E3A5F'); setPlan('esencial')
      setStartTrial(false)
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
          <label style={LABEL}>Plan de suscripción</label>
          <select
            value={plan}
            onChange={e => setPlan(e.target.value as SubscriptionPlan)}
            disabled={startTrial}
            style={{ ...INPUT, cursor: 'pointer', opacity: startTrial ? 0.5 : 1 }}
          >
            {PLAN_ORDER.map(p => (
              <option key={p} value={p}>{PLAN_CONFIG[p].label} · {PLAN_CONFIG[p].inversion}</option>
            ))}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer', marginTop: '10px' }}>
            <input
              type="checkbox"
              checked={startTrial}
              onChange={e => setStartTrial(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: 'var(--accent-gold)' }}
            />
            Iniciar en período de prueba ({TRIAL.days} días · experiencia {PLAN_CONFIG[TRIAL.plan].label})
          </label>
          {startTrial && (
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              El tenant arranca como {PLAN_CONFIG[TRIAL.plan].label} en prueba, con presupuesto de IA
              de cortesía de ${TRIAL.aiBudgetUsd}. Al convertir, fija el plan definitivo desde la gestión.
            </div>
          )}
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
  const [aiLimit, setAiLimit]         = useState(tenant.aiMonthlyLimitUsd.toFixed(2))
  const [aiUnlimited, setAiUnlimited] = useState(tenant.aiUnlimited)
  const [subPlan, setSubPlan]     = useState<SubscriptionPlan>((tenant.subscriptionPlan as SubscriptionPlan) ?? 'esencial')
  const [subStatus, setSubStatus] = useState<'trial' | 'active' | 'cancelled'>(editableStatus(tenant.subscriptionStatus))
  const [trialEnd, setTrialEnd]   = useState(dateInputValue(tenant.subscriptionTrialEndsAt))
  const [confirmSlug, setConfirmSlug] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const logoInputRef = useRef<HTMLInputElement>(null)

  function resetToView() {
    setMode('view'); setError(null)
    setName(tenant.name); setColor(tenant.primaryColor); setConfirmSlug('')
    setAiLimit(tenant.aiMonthlyLimitUsd.toFixed(2)); setAiUnlimited(tenant.aiUnlimited)
    setSubPlan((tenant.subscriptionPlan as SubscriptionPlan) ?? 'esencial')
    setSubStatus(editableStatus(tenant.subscriptionStatus))
    setTrialEnd(dateInputValue(tenant.subscriptionTrialEndsAt))
  }

  function handleSave() {
    setError(null)
    const limitNum = Number(aiLimit)
    if (!aiUnlimited && (!Number.isFinite(limitNum) || limitNum < 0)) {
      setError('El límite de IA debe ser un monto válido en USD.')
      return
    }
    startTransition(async () => {
      const res = await updateTenant({
        tenantId: tenant.id, name, primaryColor: color,
        aiMonthlyLimitUsd: aiUnlimited ? tenant.aiMonthlyLimitUsd : limitNum,
        aiUnlimited,
      })
      if (!res.ok) { setError(res.error); return }

      // Suscripción: aplicar plan/estado (resuelve cualquier solicitud pendiente).
      // Una prueba vence al final del día local elegido.
      const subRes = await updateTenantSubscription({
        tenantId:    tenant.id,
        plan:        subStatus === 'trial' ? 'partner' : subPlan,
        status:      subStatus,
        trialEndsAt: subStatus === 'trial' && trialEnd
          ? new Date(`${trialEnd}T23:59:59`).toISOString()
          : null,
      })
      if (!subRes.ok) { setError(subRes.error); return }

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
          <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--text-muted)' }}>
            IA este mes:{' '}
            <span style={{
              color: tenant.aiUnlimited
                ? 'var(--accent-teal)'
                : tenant.aiUsedThisMonthUsd >= tenant.aiMonthlyLimitUsd
                  ? 'var(--accent-coral)'
                  : 'var(--text-secondary)',
              fontWeight: 500,
            }}>
              ${tenant.aiUsedThisMonthUsd.toFixed(2)}
              {tenant.aiUnlimited ? ' · ilimitado' : ` / $${tenant.aiMonthlyLimitUsd.toFixed(2)}`}
            </span>
          </div>
          <div style={{ fontSize: '11px', marginTop: '2px', color: 'var(--text-muted)' }}>
            Suscripción:{' '}
            <span style={{ color: tenant.subscriptionStatus === 'cancelled' ? 'var(--accent-coral)' : 'var(--text-secondary)', fontWeight: 500 }}>
              {tenant.subscriptionPlan ? PLAN_CONFIG[tenant.subscriptionPlan as SubscriptionPlan]?.label ?? tenant.subscriptionPlan : 'Sin plan'}
              {tenant.subscriptionStatus && tenant.subscriptionStatus !== 'active'
                ? ` · ${SUBSCRIPTION_STATUS_LABELS[tenant.subscriptionStatus as SubscriptionStatus] ?? tenant.subscriptionStatus}`
                : ''}
            </span>
            {tenant.subscriptionStatus === 'trial' && tenant.subscriptionTrialEndsAt && (
              <span style={{
                marginLeft: '6px', fontSize: '10px', fontWeight: 500, padding: '1px 7px', borderRadius: '10px',
                color: trialDaysLeft(tenant.subscriptionTrialEndsAt) > 0 ? 'var(--accent-gold)' : 'var(--accent-coral)',
                background: trialDaysLeft(tenant.subscriptionTrialEndsAt) > 0 ? 'rgba(201,169,110,0.12)' : 'rgba(201,123,107,0.12)',
              }}>
                {trialDaysLeft(tenant.subscriptionTrialEndsAt) > 0
                  ? `Vence en ${trialDaysLeft(tenant.subscriptionTrialEndsAt)} día${trialDaysLeft(tenant.subscriptionTrialEndsAt) === 1 ? '' : 's'}`
                  : 'Prueba vencida'}
              </span>
            )}
            {(tenant.subscriptionStatus === 'change_requested' || tenant.subscriptionStatus === 'cancel_requested') && (
              <span style={{
                marginLeft: '6px', fontSize: '10px', fontWeight: 500, padding: '1px 7px', borderRadius: '10px',
                color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.12)',
              }}>
                {tenant.subscriptionStatus === 'change_requested' && tenant.subscriptionRequestedPlan
                  ? `Solicita: ${PLAN_CONFIG[tenant.subscriptionRequestedPlan as SubscriptionPlan]?.label ?? tenant.subscriptionRequestedPlan}`
                  : 'Solicita cancelar'}
              </span>
            )}
          </div>
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
              onClick={() => {
                setName(tenant.name); setColor(tenant.primaryColor)
                setAiLimit(tenant.aiMonthlyLimitUsd.toFixed(2)); setAiUnlimited(tenant.aiUnlimited)
                setSubPlan((tenant.subscriptionPlan as SubscriptionPlan) ?? 'esencial')
                setSubStatus(editableStatus(tenant.subscriptionStatus))
                setTrialEnd(dateInputValue(tenant.subscriptionTrialEndsAt))
                setMode('edit')
              }}
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
          <div>
            <label style={LABEL}>Límite mensual de IA</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>$</span>
                <input
                  type="number"
                  min={0}
                  step="0.50"
                  value={aiLimit}
                  onChange={e => setAiLimit(e.target.value)}
                  disabled={aiUnlimited}
                  style={{ ...INPUT, width: '110px', opacity: aiUnlimited ? 0.5 : 1 }}
                />
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>USD / mes</span>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={aiUnlimited}
                  onChange={e => setAiUnlimited(e.target.checked)}
                  style={{ cursor: 'pointer', accentColor: 'var(--accent-gold)' }}
                />
                Acceso ilimitado
              </label>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Uso del mes en curso: <strong style={{ color: 'var(--text-secondary)' }}>${tenant.aiUsedThisMonthUsd.toFixed(2)}</strong>.
              El contador se reinicia el día 1 de cada mes; al alcanzar el límite, las generaciones con IA se bloquean para el tenant.
            </div>
          </div>
          <div>
            <label style={LABEL}>Suscripción</label>
            {(tenant.subscriptionStatus === 'change_requested' || tenant.subscriptionStatus === 'cancel_requested') && (
              <div style={{ fontSize: '12px', color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px' }}>
                {tenant.subscriptionStatus === 'change_requested' && tenant.subscriptionRequestedPlan
                  ? <>El tenant solicitó cambiar a <strong>{PLAN_CONFIG[tenant.subscriptionRequestedPlan as SubscriptionPlan]?.label}</strong>. Selecciona el plan y guarda para aplicarlo (o deja el actual para rechazar).</>
                  : <>El tenant solicitó <strong>cancelar</strong> su suscripción. Desmarca &quot;Activa&quot; y guarda para confirmarla (o guarda sin cambios para rechazarla).</>}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <select
                value={subPlan}
                onChange={e => setSubPlan(e.target.value as SubscriptionPlan)}
                disabled={subStatus === 'trial'}
                style={{ ...INPUT, width: '240px', cursor: 'pointer', opacity: subStatus === 'trial' ? 0.5 : 1 }}
              >
                {PLAN_ORDER.map(p => (
                  <option key={p} value={p}>{PLAN_CONFIG[p].label} · {PLAN_CONFIG[p].inversion}</option>
                ))}
              </select>
              <select
                value={subStatus}
                onChange={e => setSubStatus(e.target.value as 'trial' | 'active' | 'cancelled')}
                style={{ ...INPUT, width: '170px', cursor: 'pointer' }}
              >
                <option value="active">Activa</option>
                <option value="trial">Período de prueba</option>
                <option value="cancelled">Cancelada</option>
              </select>
              {subStatus === 'trial' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>vence</span>
                  <input
                    type="date"
                    value={trialEnd}
                    onChange={e => setTrialEnd(e.target.value)}
                    style={{ ...INPUT, width: '160px', cursor: 'pointer' }}
                  />
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
              Guardar aplica el plan/estado y resuelve cualquier solicitud pendiente del tenant.
              {subStatus === 'trial' && <> En prueba, el plan efectivo es {PLAN_CONFIG[TRIAL.plan].label}; cambia la fecha para extenderla.</>}
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
