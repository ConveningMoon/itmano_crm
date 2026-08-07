// Atmósfera de fondo de la landing: tres halos de color a máxima difusión,
// pintados con radial-gradient. Estáticos a propósito — reemplazan a los blobs
// animados anteriores: en una página cuya pieza principal es un video, el fondo
// no compite por la atención. Server Component, cero JS.
//
// Nunca interactivo y nunca por encima del texto: aria-hidden + pointer-events:none.

interface BackdropProps {
  /** Multiplicador de opacidad de los tres halos (1 = hero). */
  intensity?: number
  style?: React.CSSProperties
}

export function Backdrop({ intensity = 1, style }: BackdropProps) {
  const halo = (color: string, pct: number, at: string, size: string) =>
    `radial-gradient(ellipse ${size} at ${at}, color-mix(in srgb, ${color} ${(pct * intensity).toFixed(1)}%, transparent), transparent 64%)`

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        backgroundImage: [
          halo('var(--accent-gold)', 13, '76% -12%', '72% 58%'),
          halo('var(--accent-blue)', 9, '6% 22%', '58% 52%'),
          halo('var(--accent-coral)', 7, '58% 96%', '56% 46%'),
        ].join(', '),
        ...style,
      }}
    />
  )
}
