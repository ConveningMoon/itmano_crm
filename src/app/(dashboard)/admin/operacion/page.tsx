import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { AlertTriangle, DollarSign, Bot, TrendingUp } from 'lucide-react'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getPlatformOpsInput } from '@/lib/data/platform-ops'
import { buildOpsModel } from '@/lib/ops/model'
import { buildAlerts } from '@/lib/ops/alerts'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { SettingsSectionHead } from '@/components/ui/settings-row'
import { pageMetadata } from '@/lib/routing/page-titles'
import {
  AlertsSection, CalendarSection, HealthSection, IntegrationsSection, ProvidersSection, TenantsSection,
  type IntegrationGroup,
} from './sections'
import { OperacionSkeleton } from './operacion-skeleton'

export const metadata = pageMetadata('/admin/operacion')

// Qué variables de entorno necesita cada integración. Se calcula en el servidor
// y sólo sale un booleano: el valor de una llave nunca llega a la página.
function integrationGroups(): IntegrationGroup[] {
  const has = (name: string) => !!process.env[name]?.trim()
  const v = (name: string, optional = false) => ({ name, set: has(name), optional })
  return [
    { label: 'Supabase', vars: [v('NEXT_PUBLIC_SUPABASE_URL'), v('NEXT_PUBLIC_SUPABASE_ANON_KEY'), v('SUPABASE_SERVICE_ROLE_KEY')] },
    { label: 'Resend', vars: [
      v('RESEND_API_KEY_ITMANO'), v('RESEND_API_KEY', true), v('RESEND_WEBHOOK_SECRET'),
      v('RESEND_INBOUND_API_KEY_ITMANO', true), v('RESEND_INBOUND_API_KEY', true), v('UNSUBSCRIBE_SECRET'),
      v('SEND_EMAIL_HOOK_SECRET', true), v('AUTH_EMAIL_FROM', true),
    ] },
    { label: 'IA', vars: [v('ANTHROPIC_API_KEY'), v('GOOGLE_AI_API_KEY')] },
    { label: 'Paddle', vars: [
      v('NEXT_PUBLIC_PADDLE_ENV'), v('NEXT_PUBLIC_PADDLE_CLIENT_TOKEN'), v('PADDLE_API_KEY'),
      v('PADDLE_NOTIFICATION_WEBHOOK_SECRET'), v('PADDLE_PRICE_ESENCIAL_MONTH'), v('PADDLE_PRICE_ESENCIAL_YEAR'),
      v('PADDLE_PRICE_GROWTH_MONTH'), v('PADDLE_PRICE_GROWTH_YEAR'),
    ] },
    { label: 'Avisos y procesos', vars: [
      v('TELEGRAM_BOT_TOKEN'), v('NOTIFICATIONS_WEBHOOK_SECRET'), v('CRON_SECRET'),
      v('STUDIO_RENDER_SECRET'), v('CONTACT_WEBHOOK_SECRET'),
    ] },
  ]
}

async function OperacionContent() {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') redirect('/dashboard')

  const input = await getPlatformOpsInput()
  const model = buildOpsModel(input)
  const pending = buildAlerts(model)
  const critical = pending.filter(a => a.severity === 'critical').length

  return (
    <div className="settings-stack">
      <div className="nl-kpis">
        <StatCard label="Alertas activas" value={pending.length} icon={<AlertTriangle size={16} />} tone={critical > 0 ? 'var(--alert)' : 'var(--gold-2)'} />
        <StatCard label="Ingreso mensual (USD)" value={Math.round(model.economics.revenueUsd)} icon={<DollarSign size={16} />} tone="var(--gold-1)" />
        <StatCard label="IA del mes (USD)" value={Math.round(model.economics.aiCostUsd * 100) / 100} icon={<Bot size={16} />} tone="var(--gold-3)" />
        <StatCard label="Margen estimado (USD)" value={Math.round(model.economics.marginUsd)} icon={<TrendingUp size={16} />} tone="var(--gold-2)" />
      </div>

      <section>
        <SettingsSectionHead title="Proveedores" description="Lo que paga o aporta ITMANO, contra su límite. Los límites que el sistema no puede leer se anotan en cada tarjeta." />
        <ProvidersSection providers={model.providers} settings={input.settings} />
      </section>

      <section>
        <SettingsSectionHead title="Clientes" description="Uso de cada tenant contra lo que incluye su plan. Los límites de un tenant exento se muestran sin alertar." />
        <TenantsSection tenants={model.tenants} />
      </section>

      <section>
        <SettingsSectionHead title="Procesos automáticos" description="Último latido de cada cron y webhook. Un cron atrasado deja de enviar secuencias, recalcular scores o cobrar." />
        <HealthSection health={model.health} />
      </section>

      <section>
        <SettingsSectionHead title="Calendario" description="Renovaciones, llaves que vencen, backups y pruebas por terminar." />
        <CalendarSection items={model.calendar} />
      </section>

      <section>
        <SettingsSectionHead title="Alertas enviadas" description="Las últimas que mandó el cron diario por Telegram." />
        <AlertsSection alerts={input.recentAlerts} />
      </section>

      <section>
        <SettingsSectionHead title="Integraciones" description="Variables de entorno de este despliegue: sólo si existen, nunca su valor." />
        <IntegrationsSection groups={integrationGroups()} />
      </section>
    </div>
  )
}

function OperacionPage() {
  return (
    <>
      <PageHeader
        title="Operación"
        description="Cuotas, costos y salud de todo lo que ITMANO paga o aporta, en un solo lugar."
      />
      <Suspense fallback={<OperacionSkeleton />}>
        <OperacionContent />
      </Suspense>
    </>
  )
}

export default freshOnNavigation(OperacionPage)
