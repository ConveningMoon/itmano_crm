import { GrowBar } from '@/components/motion/grow-bar'

// Lista de barras horizontales: etiqueta, carril con barra dorada y cifra. Server
// Component; la barra entra con GrowBar (isla cliente, respeta reduced motion).
// `max` fija la escala cuando varias listas deben compararse entre sí; por defecto
// es el mayor valor de la lista.
export function HBarList({ rows, max }: {
  rows: { key: string; label: React.ReactNode; value: number; display?: string }[]
  max?: number
}) {
  const scale = Math.max(1, max ?? 0, ...rows.map(r => r.value))

  return (
    <div className="hbar-list">
      {rows.map((r, i) => (
        <div key={r.key} className="hbar-row">
          <span className="hbar-label">{r.label}</span>
          <div className="hbar-track">
            <GrowBar className="hbar-fill" delay={i * 0.05} style={{ width: `${Math.min(100, (r.value / scale) * 100)}%` }} />
          </div>
          <span className="hbar-value">{r.display ?? r.value.toLocaleString('en-US')}</span>
        </div>
      ))}
    </div>
  )
}
