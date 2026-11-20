import { ChevronRight } from 'lucide-react'
import { getScoringHealth, getCalibrationLog } from '@/lib/data/scoring-model'
import { getFitEvidence } from '@/lib/data/fit-evidence'
import { getScoreRulesBundle, type ScoreRule } from '@/lib/data/score-rules'
import { currentOrder, MIN_CLOSES_FOR_EVIDENCE, type CalibrationRule } from '@/lib/scoring/calibration'
import { DIM_UI_LABEL, type Dimension } from '@/lib/scoring/vocabulary'
import { HealthSummary } from '@/components/scoring/health-summary'
import { CalibrationLog } from '@/components/scoring/calibration-log'
import { SettingsCard } from '@/components/ui/settings-row'
import { Skeleton } from '@/components/ui/skeleton'
import { CalibrationPanel } from './calibration-panel'
import { ResetScoringButton } from './reset-scoring-button'

// Configuración → Scoring de UN tenant (sólo super_admin). Responde, en este
// orden: ¿el score distingue a sus leads?, ¿en qué orden pesan sus factores de
// perfil y quién decidió ese orden?, ¿qué cambió y cuándo? El modelo de puntos
// es global y se edita en el Centro de control.
//
// Cache Components: no se cachea. Lee datos del tenant que cambian con cada
// calibración y sólo lo ve ITMANO; va detrás de su propio <Suspense>.

function asCal(rules: ScoreRule[]): CalibrationRule[] {
  return rules.map(r => ({
    category: r.category, dimension: r.dimension, matchValue: r.matchValue, points: r.points, isActive: r.isActive,
  }))
}

export async function TenantScoringPanel({ tenantId }: { tenantId: string }) {
  const [health, log, evidence, bundle] = await Promise.all([
    getScoringHealth(tenantId),
    getCalibrationLog({ tenantId, limit: 5 }),
    getFitEvidence(tenantId),
    getScoreRulesBundle(tenantId),
  ])

  const efectivas = asCal(bundle.effective)
  const orden = currentOrder(efectivas)
  const maxDe = (d: string) =>
    Math.max(0, ...efectivas.filter(r => r.category === 'fit' && r.dimension === d && r.isActive).map(r => r.points))
  const calibrado = health.raw.overrides > 0
  const spread = new Map(evidence.dimensions.map(d => [d.dimension, d.spread]))

  return (
    <div className="settings-stack">
      <SettingsCard title="Salud del scoring">
        <HealthSummary health={health} />
      </SettingsCard>

      <SettingsCard
        title="Qué pesa más en este mercado"
        hint="El orden de los factores de perfil decide cuántos puntos da cada uno. Se reparten los mismos máximos del modelo global, así que el techo del score y las bandas no cambian."
        action={calibrado ? <ResetScoringButton tenantId={tenantId} /> : undefined}
      >
        <p className="settings-note" style={{ marginBottom: '10px' }}>
          {evidence.enough
            ? <>Calibración automática activa: con {evidence.closedWithFit} cierres con perfil, el cron reordena los factores cuando uno separa claramente más a los que cierran.</>
            : <>Se calibrará solo al llegar a {MIN_CLOSES_FOR_EVIDENCE} cierres con perfil (hoy {evidence.closedWithFit}). {calibrado ? 'Mientras, rige el orden que se fijó a mano.' : 'Mientras, rige el orden del modelo global.'}</>}
        </p>
        <div>
          {orden.map((d, i) => (
            <div key={d} className="scoring-order-row">
              <span className="scoring-order-pos">{i + 1}</span>
              <span>{DIM_UI_LABEL[d as Dimension] ?? d}</span>
              {evidence.enough && spread.get(d) != null && (
                <span className="scoring-usage">separa {spread.get(d)} pp</span>
              )}
              <span className="scoring-factor-max">hasta +{maxDe(d)}</span>
            </div>
          ))}
        </div>

        <details className="scoring-disclosure" style={{ marginTop: '14px' }}>
          <summary>
            <ChevronRight size={14} className="scoring-chevron" aria-hidden="true" />
            Ajustar el orden a mano
          </summary>
          <div className="scoring-disclosure-body">
            <p className="settings-note" style={{ marginBottom: '8px' }}>
              Sólo hace falta si conoces el mercado y todavía no hay cierres suficientes. La calibración automática
              lo seguirá ajustando cuando los haya.
            </p>
            <CalibrationPanel
              rules={efectivas}
              global={asCal(bundle.global)}
              labels={Object.fromEntries(bundle.global
                .filter(r => r.category === 'fit' && r.label)
                .map(r => [`${r.dimension}|${r.matchValue}`, r.label as string]))}
              evidence={evidence}
              tenantId={tenantId}
            />
          </div>
        </details>
      </SettingsCard>

      <SettingsCard title="Historial de calibraciones">
        <CalibrationLog entries={log} />
      </SettingsCard>

      <p className="settings-note">
        Los puntos de cada señal son los mismos para todos los equipos y se ajustan en{' '}
        <a href="/admin?tab=scoring" style={{ color: 'var(--gold-2)' }}>Centro de control → Scoring</a>.
      </p>
    </div>
  )
}

export function TenantScoringSkeleton() {
  return (
    <div className="settings-stack" aria-busy="true" aria-label="Cargando scoring">
      <div className="settings-card">
        <Skeleton w="140px" h={14} style={{ marginBottom: '16px' }} />
        <div className="scoring-metrics">
          {[0, 1, 2, 3].map(i => <Skeleton key={i} w="100%" h={64} />)}
        </div>
      </div>
      <div className="settings-card">
        <Skeleton w="200px" h={14} style={{ marginBottom: '16px' }} />
        {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} w="100%" h={34} style={{ marginBottom: '6px' }} />)}
      </div>
    </div>
  )
}
