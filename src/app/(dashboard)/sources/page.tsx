import { createAdminClient } from '@/lib/supabase/admin'
import { getChannelsWithMetrics, getArchivedChannelsWithMetrics } from '@/lib/data/channels'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { SourcesClient } from './sources-client'
import { GitBranch, Users, Eye, TrendingUp } from 'lucide-react'

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const ctx = await getCurrentTenantContext()
  const { tenant_id, role } = ctx
  const isSuperAdmin = role === 'super_admin'
  const scope = scopeFor(ctx)
  const { window: windowParam } = await searchParams
  const windowDays = Number(windowParam ?? 30)
  const validWindow = [7, 30, 90].includes(windowDays) ? windowDays : 30

  // Agent sees only their own channels (excludes "Toda la agencia"); owner/super: tenant scope.
  const channels         = await getChannelsWithMetrics(tenant_id, validWindow, scope.agentId)
  const archivedChannels = await getArchivedChannelsWithMetrics(tenant_id, validWindow, scope.agentId)

  const supabase = createAdminClient()

  // super_admin needs tenant list for create-modal selects
  let tenants: Array<{ id: string; name: string }> = []
  if (isSuperAdmin) {
    const { data } = await supabase.from('tenants').select('id, name').order('name')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenants = (data ?? []).map((t: any) => ({ id: t.id as string, name: t.name as string }))
  }

  // Active agents for the owner selector (scoped to tenant; all tenants for
  // super_admin — the modals filter by the selected tenant).
  let agentsQ = supabase.from('agents').select('id, name, tenant_id').eq('active', true).order('name')
  if (!isSuperAdmin && tenant_id) agentsQ = agentsQ.eq('tenant_id', tenant_id)
  const { data: agentRows } = await agentsQ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents = (agentRows ?? []).map((a: any) => ({ id: a.id as string, name: a.name as string, tenantId: a.tenant_id as string }))

  const totalLeads     = channels.reduce((s, c) => s + c.metrics.leadsInWindow, 0)
  const totalViews     = channels.reduce((s, c) => s + c.metrics.pageViewsInWindow, 0)
  const avgConversion  = totalViews > 0 ? Math.round((totalLeads / totalViews) * 100) : 0

  const kpis = [
    { label: 'Leads generados',   value: String(totalLeads),      icon: <Users size={18} />,      color: '#5B8EC9' },
    { label: 'Vistas totales',    value: String(totalViews),      icon: <Eye size={18} />,        color: 'var(--accent-teal)' },
    { label: 'Conversión global', value: `${avgConversion}%`,     icon: <TrendingUp size={18} />, color: 'var(--accent-green)' },
    { label: 'Fuentes activas',   value: String(channels.filter(c => c.active).length), icon: <GitBranch size={18} />, color: 'var(--accent-gold)' },
  ]

  return (
    <>
      <style>{`.source-card:hover { border-color: var(--border-accent) !important; }`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Fuentes de Adquisición
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Canales activos · últimos {validWindow} días
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '24px' }}>
        {kpis.map((kpi, i) => (
          <div
            key={i}
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {kpi.label}
              </span>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(201,169,110,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: kpi.color,
              }}>
                {kpi.icon}
              </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1 }}>
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      {/* Client: tabs + window selector + cards */}
      <SourcesClient
        channels={channels}
        archivedChannels={archivedChannels}
        windowDays={validWindow}
        isSuperAdmin={isSuperAdmin}
        tenants={tenants}
        agents={agents}
      />
    </>
  )
}
