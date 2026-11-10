import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Building2, Users, Flame, TrendingUp } from 'lucide-react'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getHubData } from '@/lib/data/super-admin'
import { getNotifications } from '@/lib/data/notifications'
import { getAiUsageSummary, getAiDailyUsage, getLeadFitUsage } from '@/lib/data/ai-usage'
import { getBriefingOutcomes } from '@/lib/data/ai-briefings'
import { AiUsagePanel } from '@/components/dashboard/ai-usage-panel'
import { AiUsageDailyChart } from '@/components/charts/lazy'
import { LeadFitPanel } from './lead-fit-panel'
import { BriefingOutcomesPanel } from './briefing-outcomes-panel'
import { StatCard } from '@/components/ui/stat-card'
import { QUALITY_CONFIG } from '@/lib/scoring/priority'
import { Tabs } from '@/components/ui/tabs'
import { AdminClient } from './admin-client'
import { TenantCard } from './tenant-card'
import { HubFeed } from './hub-feed'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'
import { AdminSkeleton } from './admin-skeleton'

// Centro de control del super_admin: pulso de la plataforma, entrada al CRM de
// cada tenant y gestión (crear tenant / provisionar owner). Guarded server-side.
// Lo que lee la sesión o la base vive aquí, detrás del Suspense de AdminPage:
// la cabecera sale del shell estático.
async function AdminContent() {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') redirect('/dashboard')

  const [{ kpis, tenants }, feed, aiUsage, aiDaily, leadFit, briefingOutcomes] = await Promise.all([
    getHubData(),
    getNotifications(null, { limit: 10 }),
    // Vista global: todos los tenants + uso ITMANO sin tenant.
    getAiUsageSummary(null),
    getAiDailyUsage(30),
    getLeadFitUsage(null),
    getBriefingOutcomes(null),
  ])

  const kpiCards = [
    { label: 'Tenants', value: kpis.tenants, icon: <Building2 size={16} />, color: 'var(--gold-2)' },
    { label: 'Leads totales', value: kpis.totalLeads, icon: <Users size={16} />, color: 'var(--gold-1)' },
    { label: 'Calidad alta', value: kpis.highQualityLeads, icon: <Flame size={16} />, color: QUALITY_CONFIG.alta.color },
    { label: 'Nuevos · 30 días', value: kpis.newLeads30d, icon: <TrendingUp size={16} />, color: 'var(--gold-3)' },
  ]

  return (
    <>
      {/* KPIs de plataforma — siempre visibles, encima de los tabs */}
      <div className="nl-kpis">
        {kpiCards.map(card => (
          <StatCard key={card.label} label={card.label} value={card.value} icon={card.icon} tone={card.color} />
        ))}
      </div>

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
              <div className="admin-tenant-grid">
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
            <div className="settings-stack">
              {/* El diagrama diario reemplaza al listado de requests recientes */}
              <AiUsageDailyChart series={aiDaily} />
              <AiUsagePanel summary={aiUsage} />
            </div>
          ),
          fit: (
            <div className="settings-stack">
              <BriefingOutcomesPanel outcomes={briefingOutcomes} />
              <LeadFitPanel summary={leadFit} />
            </div>
          ),
          gestion: <AdminClient tenants={tenants} />,
        }}
      />
    </>
  )
}

function AdminPage() {
  return (
    <>
      <PageHeader
        title="Centro de control"
        description="Plataforma ITMANO: el pulso de todos los tenants, la entrada a su CRM y su gestión."
      />
      <Suspense fallback={<AdminSkeleton />}>
        <AdminContent />
      </Suspense>
    </>
  )
}

export default freshOnNavigation(AdminPage)
