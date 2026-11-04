import Link from 'next/link'
import { AnimatedNumber } from '@/components/motion/animated-number'
import { InfoHint } from '@/components/ui/info-hint'

// Tarjeta de KPI del dashboard. `highlight` es la única tarjeta destacada de una
// fila. Con `href` toda la tarjeta enlaza, pero el enlace es una capa aparte y no
// envuelve al ⓘ: dos elementos interactivos no pueden anidarse.
export function KpiCard({ label, value, note, hint, highlight = false, href }: {
  label:      string
  value:      number
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
      <div className="kpi-card-value">
        <AnimatedNumber value={value} />
      </div>
      {note && <div className="kpi-card-note">{note}</div>}
    </div>
  )
}
