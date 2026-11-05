'use client'

import { AlertTriangle } from 'lucide-react'
import type { AgentAiBreakdown, AiUsageSummary } from '@/lib/data/ai-usage'
import type { TenantRole } from '@/lib/auth/tenant-context'
import { limitGauge, type AiUsageLimitView } from '@/lib/ai-usage/view'
import { GOLD_RAMP } from '@/lib/charts/palette'
import { AreaChart } from '@/components/charts/lazy'
import { RingGauge } from '@/components/charts/ring-gauge'
import { ChartCard } from '@/components/ui/chart-card'
import { ChartFrame } from '@/components/ui/chart-frame'
import { KpiCard } from '@/components/ui/kpi-card'
import { SettingsSectionHead } from '@/components/ui/settings-row'
import { AiByAgentCard, AiByFeatureCard, AiRecentCard, fmtCost, fmtInt } from '@/components/dashboard/ai-usage-panel'
import { AiCapacityRequest } from './ai-capacity-request'

const CHART_HEIGHT = 240

// Los montos en USD sólo llegan al super_admin (page.tsx los pone en 0 para el
// resto); con showCosts la gráfica cuenta dólares y sin él, requests.
function CostExplanation({ showCosts }: { showCosts: boolean }) {
  return showCosts ? (
    <>
      El costo se calcula con los tokens reales de cada request y la tarifa vigente del modelo
      (claude-sonnet-5: $3 por millón de tokens de entrada · $15 por millón de salida). Los adjuntos
      (p. ej. el PDF de un lead magnet) aumentan los tokens de entrada, por eso esas generaciones
      cuestan más.
    </>
  ) : (
    <>
      Cada generación con IA (propiedades, correos, secuencias) consume parte del límite mensual del
      equipo. Los documentos adjuntos consumen más. El contador se reinicia el día 1 de cada mes; si
      necesitas ampliar el límite, contacta a ITMANO.
    </>
  )
}

export function AiUsageSection({ summary, showCosts, limit, limitSubtitle, byAgent, userRole }: {
  summary:        AiUsageSummary
  showCosts:      boolean
  limit:          AiUsageLimitView | null
  limitSubtitle?: string
  byAgent:        AgentAiBreakdown | null
  userRole:       TenantRole
}) {
  const { allTime, last30d, byMonth, byFeature, recent } = summary
  const gauge = limitGauge(limit)

  const data = byMonth.map(m => ({ label: m.label, value: showCosts ? m.costUsd : m.requests }))
  const empty = byMonth.every(m => m.requests === 0)
  const chartLabel = `Consumo por mes: ${byMonth
    .map(m => showCosts ? `${m.label} ${fmtCost(m.costUsd)}` : `${m.label} ${fmtInt(m.requests)} requests`)
    .join('; ')}`

  return (
    <div className="settings-stack">
      <SettingsSectionHead
        title="Uso de IA"
        description={userRole === 'agent' ? 'Tu actividad de IA.' : 'Consumo del equipo frente a su límite.'}
        action={userRole === 'agent_owner' ? <AiCapacityRequest /> : undefined}
      />

      <div className={gauge.kind === 'hidden' ? 'settings-split settings-split-solo' : 'settings-split'}>
        <ChartCard title="Consumo por mes" scope="Últimos 6 meses" hint={<CostExplanation showCosts={showCosts} />}>
          <ChartFrame height={CHART_HEIGHT} empty={empty} emptyText="Aún no hay uso de IA registrado." label={chartLabel}>
            <AreaChart
              height={CHART_HEIGHT}
              data={data}
              series={[{ key: 'value', name: showCosts ? 'Costo' : 'Requests', color: GOLD_RAMP[1] }]}
              unit={showCosts ? 'USD' : undefined}
              decimals={showCosts}
            />
          </ChartFrame>
        </ChartCard>

        {gauge.kind !== 'hidden' && (
          <ChartCard
            title="Este mes"
            hint={gauge.kind === 'gauge' ? 'Al llegar al límite, las funciones de IA se pausan hasta el mes siguiente.' : undefined}
          >
            <div className="settings-gauge">
              {gauge.kind === 'unlimited' && <span className="settings-gauge-word">Ilimitado</span>}
              {gauge.kind === 'gauge' && (
                <>
                  <RingGauge value={gauge.percent} label={`% ${limitSubtitle ?? 'del límite'}`} />
                  {gauge.blocked && (
                    <span className="settings-alert">
                      <AlertTriangle size={14} aria-hidden="true" />
                      Límite alcanzado: se reinicia el día 1
                    </span>
                  )}
                  {gauge.near && !gauge.blocked && (
                    <span className="settings-alert">
                      <AlertTriangle size={14} aria-hidden="true" />
                      Cerca del límite
                    </span>
                  )}
                </>
              )}
            </div>
          </ChartCard>
        )}
      </div>

      <div className="settings-kpis">
        <KpiCard label="Requests · 30 días" value={last30d.requests} note={`${fmtInt(allTime.requests)} en total`} />
        <KpiCard label="Tokens de entrada · 30 días" value={last30d.inputTokens} note={`${fmtInt(allTime.inputTokens)} en total`} />
        <KpiCard label="Tokens de salida · 30 días" value={last30d.outputTokens} note={`${fmtInt(allTime.outputTokens)} en total`} />
        {showCosts && (
          // El número animado redondea a enteros: el costo va ya formateado.
          <KpiCard
            label="Costo · 30 días"
            value={last30d.costUsd}
            display={fmtCost(last30d.costUsd)}
            note={`${fmtCost(allTime.costUsd)} en total`}
          />
        )}
      </div>

      <AiByAgentCard byAgent={byAgent} showCosts={showCosts} />
      <AiByFeatureCard byFeature={byFeature} showCosts={showCosts} />
      <AiRecentCard recent={recent} showCosts={showCosts} />
    </div>
  )
}
