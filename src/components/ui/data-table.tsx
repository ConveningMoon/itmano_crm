// Piezas de una tabla de filas: cabecera, bloque de filas y el contenedor que
// fija las columnas. Server Components sin estado; el estilo vive en
// dashboard-ui.css (.dt-*). Cada fila usa `className="dt-grid dt-row"`.
//
// Una sola definición de columnas para cabecera y filas: salen de las variables
// que fija DataScope, así que no pueden desalinearse. `colsMd` y `colsSm` son las
// plantillas cuando el contenido se estrecha; las celdas marcadas con `dt-hide-md`
// o `dt-hide-sm` desaparecen en esos anchos.

export interface DataColumn {
  label:  string
  /** Alinea el texto a la derecha: para cifras. */
  right?: boolean
  /** Se oculta cuando el contenido se estrecha (≈ ≤ 900px). */
  hideMd?: boolean
  /** Se oculta cuando el contenido es muy estrecho (≈ ≤ 620px). */
  hideSm?: boolean
}

export function DataScope({ cols, colsMd, colsSm, children }: {
  cols:     string
  colsMd?:  string
  colsSm?:  string
  children: React.ReactNode
}) {
  return (
    <div
      className="dt-scope"
      style={{
        '--dt-cols': cols,
        ...(colsMd ? { '--dt-cols-md': colsMd } : {}),
        ...(colsSm ? { '--dt-cols-sm': colsSm } : {}),
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
}

export function DataHead({ columns }: { columns: DataColumn[] }) {
  return (
    <div className="dt-grid dt-head">
      {columns.map((c, i) => (
        <span
          key={i}
          className={[
            c.right ? 'dt-r' : '',
            c.hideMd ? 'dt-hide-md' : '',
            c.hideSm ? 'dt-hide-sm' : '',
          ].filter(Boolean).join(' ') || undefined}
        >
          {c.label}
        </span>
      ))}
    </div>
  )
}

/** Caja redondeada que agrupa filas (una carpeta, o el bloque sin carpeta). */
export function DataBlock({ children }: { children: React.ReactNode }) {
  return <div className="dt">{children}</div>
}
