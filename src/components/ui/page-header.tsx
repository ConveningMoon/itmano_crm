// Encabezado con el que abre toda página del dashboard: título, bajada y, a la
// derecha, las acciones de la página. Es un Server Component: sólo emite marcado
// con las clases de dashboard-ui.css.
export function PageHeader({ title, description, actions }: {
  title:        string
  description?: React.ReactNode
  actions?:     React.ReactNode
}) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
