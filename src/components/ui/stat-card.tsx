import { AnimatedNumber } from '@/components/motion/animated-number'

// Tarjeta de KPI. El número cuenta desde 0 sólo en el primer montaje (el HTML
// del servidor ya trae el valor final) y el color de acento se pasa como token.
export function StatCard({ label, value, suffix, icon, tone = 'var(--accent-gold)' }: {
  label:   string
  value:   number
  /** Texto fijo tras el número, p. ej. "%". */
  suffix?: string
  icon:    React.ReactNode
  /** Un token de color, p. ej. `var(--accent-teal)`. */
  tone?:   string
}) {
  return (
    <div className="stat-card" style={{ '--tone': tone } as React.CSSProperties}>
      <div className="stat-card-top">
        <span className="stat-card-label">{label}</span>
        <span className="stat-card-icon" aria-hidden="true">{icon}</span>
      </div>
      <div className="stat-card-value">
        <AnimatedNumber value={value} />
        {suffix}
      </div>
    </div>
  )
}
