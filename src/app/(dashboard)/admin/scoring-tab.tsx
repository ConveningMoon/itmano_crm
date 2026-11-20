import { getGlobalScoreRules } from '@/lib/data/score-rules'
import { getAllScoringHealth, getCalibrationLog, getRuleUsage } from '@/lib/data/scoring-model'
import { HealthSummary } from '@/components/scoring/health-summary'
import { SettingsCard } from '@/components/ui/settings-row'
import { Skeleton } from '@/components/ui/skeleton'
import { CalibrationLog } from '@/components/scoring/calibration-log'
import { ScoringModelEditor } from './scoring-model-editor'

// Centro de control → Scoring. Primero lo que importa sin buscarlo: si el score
// de cada tenant distingue a sus leads. Después el modelo, explicado, y el
// historial de calibraciones. Va detrás de su propio <Suspense> para que el
// resto del Centro de control no espere estas lecturas.
//
// Cache Components: no se cachea. Son lecturas de super_admin que deben verse
// al instante después de editar el modelo o de que el cron calibre, y el costo
// es de una página interna con tráfico mínimo.

export async function ScoringTab() {
  const [rules, usage, healths, log] = await Promise.all([
    getGlobalScoreRules(),
    getRuleUsage(null),
    getAllScoringHealth(),
    getCalibrationLog({ limit: 8 }),
  ])
  const nombre = new Map(healths.map(h => [h.tenantId, h.tenantName]))

  return (
    <div className="settings-stack">
      <SettingsCard
        title="Salud por tenant"
        hint="Se recalcula con cada carga. Las bandas y la calibración automática las actualiza el cron diario."
      >
        <div className="scoring-tenant-grid">
          {healths.map(h => (
            <div key={h.tenantId} className="settings-panel">
              <HealthSummary health={h.health} title={h.tenantName} />
            </div>
          ))}
        </div>
      </SettingsCard>

      <ScoringModelEditor rules={rules} usage={usage} />

      <SettingsCard
        title="Calibraciones"
        hint="Cada vez que cambia el orden de los factores de perfil de un tenant: la decide el cron cuando hay 50 cierres con perfil, o ITMANO a mano."
      >
        <CalibrationLog entries={log} tenantName={id => nombre.get(id) ?? id} />
      </SettingsCard>
    </div>
  )
}

export function ScoringTabSkeleton() {
  return (
    <div className="settings-stack" aria-busy="true" aria-label="Cargando scoring">
      <div className="settings-card">
        <Skeleton w="140px" h={14} style={{ marginBottom: '16px' }} />
        <div className="scoring-tenant-grid">
          {[0, 1].map(i => (
            <div key={i} className="settings-panel">
              <Skeleton w="120px" h={14} />
              <div className="scoring-metrics">
                {[0, 1, 2, 3].map(j => <Skeleton key={j} w="100%" h={64} />)}
              </div>
              <Skeleton w="90%" h={12} />
            </div>
          ))}
        </div>
      </div>
      <div className="settings-card">
        <Skeleton w="160px" h={14} style={{ marginBottom: '16px' }} />
        {[0, 1, 2, 3, 4, 5].map(i => <Skeleton key={i} w="100%" h={40} style={{ marginBottom: '8px' }} />)}
      </div>
    </div>
  )
}
