import { Suspense } from 'react'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { getSubscription } from '@/lib/data/subscriptions'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { parseDashboardParams, tabUsesPeriod, visibleTabs } from '@/lib/dashboard/params'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { DashboardTabs } from './dashboard-tabs'
import { TabSkeleton } from './tab-skeletons'
import { GeneralTab } from './tabs/general'
import { AgentesTab } from './tabs/agentes'
import { EmailsTab } from './tabs/emails'
import { FuentesTab } from './tabs/fuentes'
import { NewsletterTab } from './tabs/newsletter'

// La pestaña y el periodo viven en la URL (?tab=…&periodo=…). Todo lo que lee la
// sesión o la base cuelga del Suspense de loading.tsx, y cada pestaña tiene el
// suyo para que cambiar de una a otra no bloquee la barra. Sin `use cache`: los
// datos dependen de la sesión y del scope.
async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [ctx, raw] = await Promise.all([requireTenantContext(), searchParams])

  // super_admin en modo hub (sin tenant) no tiene suscripción: canUseNewsletters
  // lo deja pasar por rol.
  const subscription = ctx.tenant_id ? await getSubscription(ctx.tenant_id) : null
  const plan: SubscriptionPlan = subscription?.plan ?? 'esencial'

  const opts = {
    canSeeAgents: ctx.role !== 'agent',
    canSeeNewsletter: canUseNewsletters({ role: ctx.role }, plan),
  }
  const { tab, period } = parseDashboardParams(raw, opts)

  return (
    <DashboardTabs tabs={visibleTabs(opts)} active={tab} period={period} showPeriod={tabUsesPeriod(tab)}>
      <Suspense key={tab} fallback={<TabSkeleton tab={tab} />}>
        {tab === 'general' && <GeneralTab ctx={ctx} period={period} />}
        {tab === 'agentes' && <AgentesTab ctx={ctx} period={period} />}
        {tab === 'emails' && <EmailsTab ctx={ctx} period={period} />}
        {tab === 'fuentes' && <FuentesTab ctx={ctx} period={period} />}
        {tab === 'newsletter' && <NewsletterTab ctx={ctx} period={period} />}
      </Suspense>
    </DashboardTabs>
  )
}

export default freshOnNavigation(DashboardPage)
