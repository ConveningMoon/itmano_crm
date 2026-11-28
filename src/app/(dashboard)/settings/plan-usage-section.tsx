import { getSubscription } from '@/lib/data/subscriptions'
import { getTenantEntitlements } from '@/lib/subscriptions/entitlements-server'
import { buildPlanUsageRows, type PlanUsageRow } from '@/lib/subscriptions/plan-usage'
import type { AiUsageLimitView } from '@/lib/ai-usage/view'
import { PLANS } from '@/lib/plans'
import { SettingsCard } from '@/components/ui/settings-row'

// Configuración → Cuenta y acceso → "Tu plan": cuánto lleva usado el tenant de
// cada tope. Server Component que lee la sesión/base, por eso no usa `use cache`
// y page.tsx lo monta detrás de <Suspense> con PlanUsageSkeleton.
//
// Los tenants billing_exempt (cortesía) no tienen topes: no se renderiza.

export async function PlanUsageSection({ tenantId, ai }: {
  tenantId: string
  /** Indicador de IA que la página ya calculó (sin montos); no se vuelve a consultar. */
  ai: (AiUsageLimitView & { perAgent?: boolean }) | null
}) {
  const [subscription, entitlements] = await Promise.all([
    getSubscription(tenantId),
    getTenantEntitlements(tenantId),
  ])
  if (subscription?.billingExempt) return null

  const plan = subscription?.plan ?? 'esencial'
  const rows = buildPlanUsageRows({ plan, entitlements, ai })

  return (
    <SettingsCard title="Tu plan" hint={`Uso de lo incluido en tu plan ${PLANS[plan].label}. Los correos y la IA se reinician cada mes; al cambiar de plan se amplían los topes.`}>
      {rows.map(row => <UsageRow key={row.key} row={row} />)}
    </SettingsCard>
  )
}

function UsageRow({ row }: { row: PlanUsageRow }) {
  const percent = row.kind === 'bar' || row.kind === 'percent' ? row.percent : null
  const tone = row.kind === 'bar' || row.kind === 'percent' ? row.tone : 'ok'
  return (
    <div className="plan-usage-row" data-tone={tone}>
      <div className="plan-usage-head">
        <span className="plan-usage-label">{row.label}</span>
        <span className="plan-usage-detail">
          {row.kind === 'unlimited' && row.used !== null ? `${row.used.toLocaleString('es-MX')} · ${row.detail}` : row.detail}
        </span>
      </div>
      {percent !== null && (
        <div
          className="plan-usage-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={`${row.label}: ${row.detail}`}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      {row.hint && <p className="plan-usage-hint">{row.hint}</p>}
    </div>
  )
}
