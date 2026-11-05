import type { ReactNode } from 'react'

// Piezas de formulario de /settings. Sin estado: sirven igual en Server y
// Client Components. Los estilos viven en dashboard-ui.css (.settings-*).

/** Tarjeta con título y, opcionalmente, una bajada y una acción a la derecha. */
export function SettingsCard({
  title, hint, action, children,
}: {
  title: string
  hint?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="settings-card-title">{title}</h3>
          {hint && <p className="settings-card-hint">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/** Fila etiqueta + control. Con `htmlFor` la etiqueta enfoca el control. */
export function SettingsRow({
  label, hint, htmlFor, children,
}: {
  label: string
  hint?: string
  htmlFor?: string
  children: ReactNode
}) {
  // Sin control asociado no hay nada que enfocar: un <label> huérfano sólo ensucia el árbol de accesibilidad.
  const Tag = htmlFor ? 'label' : 'span'
  return (
    <div className="settings-row">
      <Tag className="settings-row-label" {...(htmlFor ? { htmlFor } : {})}>
        {label}
        {hint && <span className="settings-row-hint">{hint}</span>}
      </Tag>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  )
}

/** Encabezado de una sección (17 px) con acción opcional. */
export function SettingsSectionHead({
  title, description, action, titleId,
}: {
  title: string
  description?: string
  action?: ReactNode
  /** Hace el título enfocable por programa (tabIndex -1) para mover el foco a la sección. */
  titleId?: string
}) {
  return (
    <div className="settings-section-head">
      <div style={{ minWidth: 0 }}>
        <h2 className="settings-section-title" id={titleId} tabIndex={titleId ? -1 : undefined}>{title}</h2>
        {description && <p className="settings-section-desc">{description}</p>}
      </div>
      {action}
    </div>
  )
}
