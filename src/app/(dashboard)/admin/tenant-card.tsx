import { AlertTriangle } from 'lucide-react'
import type { TenantOverview } from '@/lib/data/super-admin'
import { enterTenant } from './actions'
import { LeadScoringToggle } from './lead-scoring-toggle'

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} d`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Card de tenant del centro de control. Server Component: el botón dispara la
// server action enterTenant bindeada (sin isla client). El borde izquierdo usa
// primary_color del tenant — primera lectura del branding por-tenant en la UI.
export function TenantCard({ tenant, isActive }: { tenant: TenantOverview; isActive: boolean }) {
  return (
    <div
      className="card-interactive"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderLeft: `3px solid ${tenant.primaryColor}`,
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {tenant.name}
          </span>
          {isActive && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                color: 'var(--accent-gold)',
                background: 'color-mix(in srgb, var(--accent-gold) 12%, transparent)',
                padding: '2px 8px',
                borderRadius: '10px',
              }}
            >
              Activo
            </span>
          )}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {tenant.slug}
        </div>
      </div>

      {tenant.ownerEmail ? (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {tenant.ownerEmail}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--accent-coral)' }}>
          <AlertTriangle size={13} /> Sin owner provisionado
        </div>
      )}

      <div style={{ display: 'flex', gap: '16px', fontSize: '13px' }}>
        <span style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{tenant.totalLeads}</strong> leads
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--status-hot)', fontWeight: 500 }}>{tenant.hotLeads}</strong> calientes
        </span>
        <span style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--accent-green)', fontWeight: 500 }}>+{tenant.newLeads30d}</strong> 30d
        </span>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        Última actividad: {tenant.lastActivityAt ? relativeTime(tenant.lastActivityAt) : 'sin actividad'}
      </div>

      {/* Toggle de análisis de fit con IA (fase de prueba, apagado por defecto) */}
      <LeadScoringToggle tenantId={tenant.id} initial={tenant.aiLeadScoringEnabled} />

      <form action={enterTenant.bind(null, tenant.id)} style={{ marginTop: '4px' }}>
        <button
          type="submit"
          className="btn-cta"
          style={{
            width: '100%',
            padding: '9px 16px',
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: '8px',
            background: 'var(--accent-gold)',
            color: 'var(--bg-base)',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isActive ? 'Continuar en el CRM' : 'Entrar al CRM'}
        </button>
      </form>
    </div>
  )
}
