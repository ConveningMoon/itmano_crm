import Link from 'next/link'
import { Sparkline } from '@/components/charts/sparkline'
import { AnimatedNumber } from '@/components/motion/animated-number'
import { InfoHint } from '@/components/ui/info-hint'

// Tarjeta de KPI del dashboard. `highlight` es la única tarjeta destacada de una
// fila. Con `href` toda la tarjeta enlaza, pero el enlace es una capa aparte y no
// envuelve al ⓘ: dos elementos interactivos no pueden anidarse.
export function KpiCard({ label, value, suffix, spark, note, hint, highlight = false, href }: {
  label:      string
  value:      number
  /** Unidad pegada al número (p. ej. "%"). */
  suffix?:    string
  /** Tendencia: una minigráfica a la derecha del número. */
  spark?:     number[]
  note?:      React.ReactNode
  hint?:      React.ReactNode
  highlight?: boolean
  href?:      string
}) {
  return (
    <div className="kpi-card" data-highlight={highlight || undefined}>
      {href && <Link href={href} className="kpi-card-link" aria-label={`${label}: ver detalle`} />}
      <div className="kpi-card-top">
        <span className="kpi-card-label">{label}</span>
        {hint && <InfoHint label={`Qué es ${label}`}>{hint}</InfoHint>}
      </div>
      <div className="kpi-card-main">
        <div className="kpi-card-value">
          <AnimatedNumber value={value} />
          {suffix && <span className="kpi-card-suffix">{suffix}</span>}
        </div>
        {spark && spark.length > 1 && <Sparkline values={spark} />}
      </div>
      {note && <div className="kpi-card-note">{note}</div>}
    </div>
  )
}
