// Marco de una gráfica: le da un resumen en texto (las gráficas de recharts son
// SVG sin significado para un lector de pantalla) y un estado vacío con la misma
// altura que el gráfico, para que la tarjeta no salte cuando todavía no hay datos.
// Server Component: sólo emite marcado; el gráfico entra como children.
export function ChartFrame({ label, empty = false, emptyText = 'Todavía no hay datos para mostrar.', height, children }: {
  /** Resumen de lo que dice la gráfica, en una frase con las cifras clave. */
  label:      string
  empty?:     boolean
  emptyText?: string
  /** Altura del gráfico (px): la del estado vacío. */
  height:     number
  children:   React.ReactNode
}) {
  if (empty) {
    return (
      <div style={{
        minHeight: `${Math.round(height * 0.6)}px`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: '24px', marginTop: '8px',
        border: '1px dashed var(--border-hover)', borderRadius: '10px',
        fontSize: '13px', color: 'var(--text-secondary)',
      }}>
        {emptyText}
      </div>
    )
  }
  return <div role="img" aria-label={label}>{children}</div>
}
