import { InfoHint } from '@/components/ui/info-hint'
import { hintLabel } from '@/components/ui/hint-label'

// Tarjeta que contiene una gráfica o lista del dashboard: título, ⓘ opcional con la
// explicación, el alcance de los datos (p. ej. "últimos 30 días") y una acción
// (un enlace "Ver todo"). Server Component: el contenido entra como children.
export function ChartCard({ title, hint, scope, action, children }: {
  title:     string
  hint?:     React.ReactNode
  scope?:    string
  action?:   React.ReactNode
  children:  React.ReactNode
}) {
  return (
    <section className="chart-card">
      <header className="chart-card-head">
        <div className="chart-card-heading">
          <h2 className="chart-card-title">{title}</h2>
          {hint && <InfoHint label={hintLabel(title)}>{hint}</InfoHint>}
          {scope && <span className="chart-card-scope">{scope}</span>}
        </div>
        {action && <div className="chart-card-action">{action}</div>}
      </header>
      {children}
    </section>
  )
}
