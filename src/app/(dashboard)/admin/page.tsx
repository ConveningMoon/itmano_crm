import { redirect } from 'next/navigation'
import { Building2, Users, Flame, TrendingUp } from 'lucide-react'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getHubData } from '@/lib/data/super-admin'
import { getNotifications } from '@/lib/data/notifications'
import { getAiUsageSummary, getAiDailyUsage, getLeadFitUsage } from '@/lib/data/ai-usage'
import { AiUsagePanel } from '@/components/dashboard/ai-usage-panel'
import { AiUsageDailyChart } from './ai-usage-chart'
import { LeadFitPanel } from './lead-fit-panel'
import { StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import { AnimatedNumber } from '@/components/motion/animated-number'
import { Tabs } from '@/components/ui/tabs'
import { AdminClient } from './admin-client'
import { TenantCard } from './tenant-card'
import { HubFeed } from './hub-feed'

// Centro de control del super_admin: pulso de la plataforma, entrada al CRM de
// cada tenant y gestión (crear tenant / provisionar owner). Guarded server-side.
export default async function AdminPage() {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') redirect('/dashboard')

  const [{ kpis, tenants }, feed, aiUsage, aiDaily, leadFit] = await Promise.all([
    getHubData(),
    getNotifications(null, { limit: 10 }),
    // Vista global: todos los tenants + uso ITMANO sin tenant.
    getAiUsageSummary(null),
    getAiDailyUsage(30),
    getLeadFitUsage(null),
  ])

  const kpiCards = [
    { label: 'Tenants', value: kpis.tenants, icon: <Building2 size={16} />, color: 'var(--accent-gold)' },
    { label: 'Leads totales', value: kpis.totalLeads, icon: <Users size={16} />, color: 'var(--accent-blue)' },
    { label: 'Calientes', value: kpis.hotLeads, icon: <Flame size={16} />, color: 'var(--status-hot)' },
    { label: 'Nuevos · 30 días', value: kpis.newLeads30d, icon: <TrendingUp size={16} />, color: 'var(--accent-green)' },
  ]

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Centro de control
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Plataforma ITMANO · {kpis.tenants} {kpis.tenants === 1 ? 'tenant' : 'tenants'}
        </p>
      </div>

      {/* KPIs de plataforma — siempre visibles, encima de los tabs */}
      <StaggerGroup className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '24px' }}>
        {kpiCards.map(card => (
          <StaggerItem
            key={card.label}
            className="card-interactive"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px',
              padding: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  background: `color-mix(in srgb, ${card.color} 12%, transparent)`,
                  color: card.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {card.icon}
              </div>
              <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 500 }}>
                {card.label}
              </span>
            </div>
            <div style={{ fontSize: '32px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1 }}>
              <AnimatedNumber value={card.value} />
            </div>
          </StaggerItem>
        ))}
      </StaggerGroup>

      <Tabs
        items={[
          { key: 'tenants', label: 'Tenants', badge: kpis.tenants },
          { key: 'ia', label: 'Uso de IA' },
          { key: 'fit', label: 'Fit IA', badge: leadFit.count || undefined },
          { key: 'gestion', label: 'Gestión' },
        ]}
        content={{
          tenants: (
            <>
              <div
                className="grid grid-cols-1 md:grid-cols-2 gap-4"
                style={{ marginBottom: '24px' }}
              >
                {tenants.map(t => (
                  <TenantCard
                    key={t.id}
                    tenant={t}
                    isActive={ctx.acting_as_tenant && ctx.tenant_id === t.id}
                  />
                ))}
              </div>
              <HubFeed notifications={feed} />
            </>
          ),
          ia: (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* El diagrama diario reemplaza al listado de requests recientes */}
              <AiUsageDailyChart series={aiDaily} />
              <AiUsagePanel summary={aiUsage} showRecent={false} />
            </div>
          ),
          fit: <LeadFitPanel summary={leadFit} />,
          gestion: <AdminClient tenants={tenants} />,
        }}
      />
    </>
  )
}
