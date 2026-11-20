import { SettingsCard } from '@/components/ui/settings-row'
import { DataScope, DataHead, DataBlock, type DataColumn } from '@/components/ui/data-table'
import { FechaLocal, TiempoRelativo } from '@/components/ui/local-date'
import { PLANS } from '@/lib/plans'
import { SUBSCRIPTION_STATUS_LABELS } from '@/lib/subscriptions'
import {
  formatValue, type CalendarItem, type Gauge, type GaugeStatus, type HealthRow, type HealthStatus,
  type ProviderCard, type ProviderSettingRow, type TenantRow,
} from '@/lib/ops/model'
import type { RecentAlert } from '@/lib/data/platform-ops'
import { ProviderSettingsEditor } from './provider-settings-editor'

// Secciones del panel de operación. Server Components sin estado: reciben el
// modelo ya calculado (src/lib/ops/model.ts) y sólo pintan.

// Paleta del CRM (oscuro con dorado): el tono de la barra sale de --gold-* y
// --alert; los pills usan sus data-tone de dashboard-ui.css.
const STATUS_PILL: Record<GaugeStatus, { tone: string; label: string; color: string }> = {
  ok:       { tone: 'green', label: 'Bien',        color: 'var(--gold-3)' },
  warn:     { tone: 'gold',  label: 'Atención',    color: 'var(--gold-1)' },
  critical: { tone: 'alert', label: 'Urgente',     color: 'var(--alert)' },
  unknown:  { tone: 'mute',  label: 'Sin límite',  color: 'var(--text-muted)' },
}

export function StatusPill({ status, label }: { status: GaugeStatus; label?: string }) {
  const p = STATUS_PILL[status]
  return <span className="pill pill-xs" data-tone={p.tone}>{label ?? p.label}</span>
}

function GaugeRow({ g }: { g: Gauge }) {
  const tone = STATUS_PILL[g.status].color
  return (
    <div className="ops-gauge">
      <span className="ops-gauge-label">{g.label}</span>
      <span className="ops-gauge-value">
        {formatValue(g.unit, g.value)}
        {g.limit !== null
          ? <span className="ops-cell-limit"> / {formatValue(g.unit, g.limit)}</span>
          : <span className="ops-cell-limit"> · sin límite anotado</span>}
      </span>
      {g.ratio !== null && (
        <div className="meter meter-wide" style={{ '--tone': tone } as React.CSSProperties}
          role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(g.ratio, 1) * 100)} aria-label={g.label}>
          <i style={{ transform: `scaleX(${Math.min(g.ratio, 1)})` }} />
        </div>
      )}
      {g.hint && <span className="ops-gauge-hint">{g.hint}</span>}
    </div>
  )
}

export function ProvidersSection({ providers, settings }: { providers: ProviderCard[]; settings: ProviderSettingRow[] }) {
  return (
    <div className="ops-grid">
      {providers.map(p => {
        const setting = settings.find(s => s.key === p.key)
        return (
          <SettingsCard
            key={p.key}
            title={p.label}
            action={p.gauges.length > 0 ? <StatusPill status={p.status} /> : undefined}
          >
            {p.gauges.map(g => <GaugeRow key={g.id} g={g} />)}
            <dl className="ops-facts">
              <dt>Plan</dt><dd>{p.plan ?? 'Sin anotar'}</dd>
              <dt>Costo mensual</dt><dd>{p.monthlyCostUsd !== null ? formatValue('usd', p.monthlyCostUsd) : 'Sin anotar'}</dd>
              {p.facts.map(f => <FactRow key={f.label} label={f.label} value={f.value} />)}
            </dl>
            {p.notes && <p className="ops-gauge-hint" style={{ marginTop: '8px' }}>{p.notes}</p>}
            {setting && <div style={{ marginTop: '12px' }}><ProviderSettingsEditor setting={setting} /></div>}
          </SettingsCard>
        )
      })}
    </div>
  )
}

function FactRow({ label, value }: { label: string; value: string }) {
  return <><dt>{label}</dt><dd>{value}</dd></>
}

const TENANT_COLUMNS: DataColumn[] = [
  { label: 'Cliente' },
  { label: 'Leads', right: true },
  { label: 'Correos mes', right: true, hideSm: true },
  { label: 'IA mes', right: true },
  { label: 'Logins', right: true, hideMd: true },
  { label: 'Web', right: true, hideMd: true },
  { label: 'Storage', right: true, hideSm: true },
]
const T_COLS = 'minmax(180px, 2fr) repeat(6, minmax(70px, 1fr))'
const T_COLS_MD = 'minmax(160px, 2fr) repeat(4, minmax(70px, 1fr))'
const T_COLS_SM = 'minmax(140px, 2fr) repeat(2, minmax(64px, 1fr))'

function GaugeCell({ g, className }: { g: Gauge | undefined; className?: string }) {
  if (!g) return <span className={`dt-r dt-num ${className ?? ''}`}>—</span>
  return (
    <span className={`dt-r dt-num ${className ?? ''}`} style={{ color: g.status === 'ok' || g.status === 'unknown' ? undefined : STATUS_PILL[g.status].color }}>
      {formatValue(g.unit, g.value)}
      <span className="ops-cell-limit">{g.limit === null ? ' / ∞' : ` / ${formatValue(g.unit, g.limit)}`}</span>
    </span>
  )
}

export function TenantsSection({ tenants }: { tenants: TenantRow[] }) {
  const byId = (t: TenantRow, id: string) => t.gauges.find(g => g.id === id)
  return (
    <DataScope cols={T_COLS} colsMd={T_COLS_MD} colsSm={T_COLS_SM}>
      <DataHead columns={TENANT_COLUMNS} />
      <DataBlock>
        {tenants.map(t => (
          <div key={t.id} className="dt-grid dt-row">
            <div className="dt-cell-main">
              <span className="dt-title">{t.name} <StatusPill status={t.usageStatus} /></span>
              <div className="dt-meta">
                <span>{PLANS[t.plan].label}</span>
                <span>{t.billingExempt ? 'Exento de pago' : SUBSCRIPTION_STATUS_LABELS[t.status]}</span>
                {t.trialDaysLeft !== null && <span>{t.trialDaysLeft > 0 ? `${t.trialDaysLeft} días de prueba` : 'Prueba vencida'}</span>}
                {t.revenueUsd > 0 && <span>{formatValue('usd', t.revenueUsd)}/mes</span>}
              </div>
            </div>
            <GaugeCell g={byId(t, 'leads')} />
            <GaugeCell g={byId(t, 'emails_month')} className="dt-hide-sm" />
            <GaugeCell g={byId(t, 'ai_month')} />
            <GaugeCell g={byId(t, 'logins')} className="dt-hide-md" />
            <GaugeCell g={byId(t, 'web_properties')} className="dt-hide-md" />
            <span className="dt-r dt-num dt-hide-sm">{formatValue('bytes', t.storageBytes)}</span>
          </div>
        ))}
      </DataBlock>
    </DataScope>
  )
}

const HEALTH_PILL: Record<HealthStatus, { status: GaugeStatus; label: string }> = {
  ok:      { status: 'ok',       label: 'Corriendo' },
  stale:   { status: 'critical', label: 'Atrasado' },
  failing: { status: 'critical', label: 'Falla' },
  never:   { status: 'warn',     label: 'Sin registro' },
  waiting: { status: 'unknown',  label: 'Sin eventos' },
}

const FECHA_HORA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }

export function HealthSection({ health }: { health: HealthRow[] }) {
  return (
    <div className="feed">
      {health.map(h => (
        <div key={h.job} className="feed-row">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{h.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {h.trigger}
              {h.lastRunAt && <> · última vez <TiempoRelativo fecha={h.lastRunAt} /></>}
              {h.status === 'failing' && h.lastOkAt && <> · última correcta <FechaLocal fecha={h.lastOkAt} opciones={FECHA_HORA} /></>}
            </div>
            {h.lastError && h.status === 'failing' && (
              <div style={{ fontSize: '12px', color: 'var(--alert)', marginTop: '2px' }}>{h.lastError}</div>
            )}
          </div>
          <StatusPill status={HEALTH_PILL[h.status].status} label={HEALTH_PILL[h.status].label} />
        </div>
      ))}
    </div>
  )
}

export interface IntegrationGroup { label: string; vars: { name: string; set: boolean; optional?: boolean }[] }

export function IntegrationsSection({ groups }: { groups: IntegrationGroup[] }) {
  return (
    <div className="ops-grid">
      {groups.map(g => (
        <SettingsCard key={g.label} title={g.label}>
          <dl className="ops-facts">
            {g.vars.map(v => (
              <FactRowNode key={v.name} label={v.name}>
                <StatusPill status={v.set ? 'ok' : v.optional ? 'unknown' : 'critical'} label={v.set ? 'Configurada' : v.optional ? 'Opcional' : 'Falta'} />
              </FactRowNode>
            ))}
          </dl>
        </SettingsCard>
      ))}
    </div>
  )
}

function FactRowNode({ label, children }: { label: string; children: React.ReactNode }) {
  return <><dt style={{ fontFamily: 'monospace' }}>{label}</dt><dd>{children}</dd></>
}

const FECHA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' }

export function CalendarSection({ items }: { items: CalendarItem[] }) {
  if (items.length === 0) {
    return <div className="empty-card">Sin fechas anotadas. Anótalas en cada proveedor (renovación y vencimiento de llaves).</div>
  }
  return (
    <div className="feed">
      {items.map(c => (
        <div key={c.id} className="feed-row">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{c.label}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              <FechaLocal fecha={c.date} opciones={FECHA} /> · {c.daysLeft < 0 ? `vencido hace ${Math.abs(c.daysLeft)} días` : `en ${c.daysLeft} días`}
            </div>
          </div>
          <StatusPill status={c.status} label={c.status === 'ok' ? 'Al día' : undefined} />
        </div>
      ))}
    </div>
  )
}

export function AlertsSection({ alerts }: { alerts: RecentAlert[] }) {
  if (alerts.length === 0) {
    return <div className="empty-card">Todavía no se ha enviado ninguna alerta. El cron diario las manda por Telegram cuando algo pasa del 80%.</div>
  }
  return (
    <div className="feed">
      {alerts.map(a => (
        <div key={a.id} className="feed-row">
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{a.message}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              <FechaLocal fecha={a.sent_at} opciones={FECHA_HORA} /> · {a.delivered ? 'enviada por Telegram' : 'no se pudo enviar'}
            </div>
          </div>
          <StatusPill status={a.severity} />
        </div>
      ))}
    </div>
  )
}
