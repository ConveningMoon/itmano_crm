import { InfoHint } from '@/components/ui/info-hint'

// Encabezado con el que abre toda página del dashboard: título, bajada y, a la
// derecha, las acciones de la página. Es un Server Component: sólo emite marcado
// con las clases de dashboard-ui.css. `hint` pone un ⓘ junto al título para la
// explicación larga que no debe ocupar la bajada.
export function PageHeader({ title, description, hint, actions }: {
  title:        string
  description?: React.ReactNode
  hint?:        React.ReactNode
  actions?:     React.ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        {hint ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 className="page-title">{title}</h1>
            <InfoHint label={`Qué es ${title}`}>{hint}</InfoHint>
          </div>
        ) : (
          <h1 className="page-title">{title}</h1>
        )}
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
