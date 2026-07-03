// Agrupador visual de campos dentro de formularios y modales. Server-safe
// (sin estado ni motion) — usable igual dentro de client components.
interface FormSectionProps {
  title: string
  // Nota opcional bajo el título (12px, muted, sin uppercase).
  description?: string
  children: React.ReactNode
  // true en la primera sección: omite el separador y el padding superior.
  first?: boolean
}

export function FormSection({ title, description, children, first = false }: FormSectionProps) {
  return (
    <div
      style={{
        paddingTop: first ? 0 : '18px',
        borderTop: first ? 'none' : '1px solid var(--border-subtle)',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 500,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
          marginBottom: description ? '2px' : '12px',
        }}
      >
        {title}
      </div>
      {description && (
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
          {description}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>{children}</div>
    </div>
  )
}
