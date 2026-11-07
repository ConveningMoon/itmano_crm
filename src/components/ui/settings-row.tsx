import type { ReactNode } from 'react'
import { InfoHint } from '@/components/ui/info-hint'
import { hintLabel } from '@/components/ui/hint-label'

// Piezas de formulario de /settings. Sin estado: sirven igual en Server y
// Client Components. Los estilos viven en dashboard-ui.css (.settings-*).

/** Tarjeta con título, ⓘ opcional junto al título y una acción (de verdad) a la derecha. */
export function SettingsCard({
  title, hint, action, children,
}: {
  title: string
  hint?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <div className="settings-card-heading">
          <h3 className="settings-card-title">{title}</h3>
          {hint && <InfoHint label={hintLabel(title)}>{hint}</InfoHint>}
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

/**
 * Fila etiqueta + ⓘ + control. Con `htmlFor` la etiqueta enfoca el control. El ⓘ
 * es hermano de la etiqueta, no hijo: un botón dentro de un <label> roba el clic.
 */
export function SettingsRow({
  label, hint, htmlFor, children,
}: {
  label: string
  hint?: ReactNode
  htmlFor?: string
  children: ReactNode
}) {
  // Sin control asociado no hay nada que enfocar: un <label> huérfano sólo ensucia el árbol de accesibilidad.
  const Tag = htmlFor ? 'label' : 'span'
  return (
    <div className="settings-row">
      <div className="settings-row-labelwrap">
        <Tag className="settings-row-label" {...(htmlFor ? { htmlFor } : {})}>{label}</Tag>
        {hint && <InfoHint label={hintLabel(label)}>{hint}</InfoHint>}
      </div>
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
