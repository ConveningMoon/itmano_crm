import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import {
  BAND_MODE_LABEL, HEALTH_LEVEL_LABEL, type HealthLevel, type ScoringHealth,
} from '@/lib/scoring/health'

// Veredicto del scoring de un tenant: cuatro números y, debajo, qué pasa y por
// qué, en frases. Sin estado: sirve en Server y Client Components. Lo usan el
// Centro de control (todos los tenants) y Configuración → Scoring (uno).

const ICON: Record<HealthLevel, React.ReactNode> = {
  info:     <Info size={14} aria-hidden="true" />,
  atencion: <CircleAlert size={14} aria-hidden="true" />,
  problema: <TriangleAlert size={14} aria-hidden="true" />,
}

const BAND_SUB: Record<ScoringHealth['bandMode'], string> = {
  quintiles:         'Cada banda reúne un 20% de la cartera activa.',
  fijos_pocos_leads: 'Menos de 20 leads activos: cortes 80 / 60 / 35 / 15.',
  fijos_sin_senal:   'Casi todos empatan: cortes 80 / 60 / 35 / 15.',
  sin_calcular:      'El cron diario todavía no las calculó.',
}

export function HealthSummary({ health, title }: { health: ScoringHealth; title?: string }) {
  const { raw, level, bandMode, fitCoverage, fitCoverageBase, calibration, findings } = health
  const avance = Math.min(100, Math.round((calibration.closesWithFit / calibration.needed) * 100))

  return (
    <div className="scoring-health">
      <div className="scoring-health-head">
        {title && <span className="scoring-health-name">{title}</span>}
        <span className="scoring-level" data-level={level}>
          {ICON[level]}
          {HEALTH_LEVEL_LABEL[level]}
        </span>
      </div>

      <div className="scoring-metrics">
        <div className="scoring-metric">
          <div className="scoring-metric-label">Leads con perfil</div>
          <div className="scoring-metric-value">{fitCoverage === null ? '—' : `${fitCoverage}%`}</div>
          <div className="scoring-metric-sub">
            {fitCoverageBase > 0
              ? `de ${fitCoverageBase} ${raw.recentLeads > 0 ? 'en 90 días' : 'activos'}`
              : 'sin leads todavía'}
          </div>
        </div>

        <div className="scoring-metric">
          <div className="scoring-metric-label">Bandas de calidad</div>
          <div className="scoring-metric-value scoring-metric-value-text">{BAND_MODE_LABEL[bandMode]}</div>
          <div className="scoring-metric-sub">{BAND_SUB[bandMode]}</div>
        </div>

        <div className="scoring-metric">
          <div className="scoring-metric-label">Calibración automática</div>
          <div className="scoring-metric-value">
            {calibration.ready ? 'Activa' : `${calibration.closesWithFit} / ${calibration.needed}`}
          </div>
          <div className="scoring-metric-sub">
            {calibration.ready ? 'Se ajusta sola con los cierres.' : 'cierres con perfil para empezar'}
          </div>
          {!calibration.ready && (
            <div className="scoring-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={avance}
              aria-label="Avance hacia la calibración automática">
              <span style={{ width: `${avance}%` }} />
            </div>
          )}
        </div>

        <div className="scoring-metric">
          <div className="scoring-metric-label">Acciones del agente</div>
          <div className="scoring-metric-value">{raw.manualActions90d}</div>
          <div className="scoring-metric-sub">visitas, citas y propuestas en 90 días</div>
        </div>
      </div>

      {findings.length > 0 && (
        <ul className="scoring-findings">
          {findings.map(f => (
            <li key={f.code} className="scoring-finding" data-level={f.level}>
              {ICON[f.level]}
              <span><strong>{f.title}.</strong> {f.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
