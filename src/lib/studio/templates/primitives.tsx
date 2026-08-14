import type { Stat } from './types'

// Bloques compartidos por los nueve diseños. Existen para que las tres variantes
// de una receta se vean como la misma familia, y para que un ajuste de sombra o
// de radio se haga en un solo sitio.
//
// RECORDATORIO satori: todo elemento con MÁS DE UN HIJO necesita display:'flex'
// explícito, o el render lanza.

export const ICONS: Record<string, string> = {
  ruler: 'M3 12h18M6 9v6M12 9v6M18 9v6',
  bed:   'M3 18v-6h18v6M3 12V8h8v4M14 12V8h7v4',
  bath:  'M4 12h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z M7 12V5a2 2 0 0 1 4 0',
  pin:   'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  phone: 'M4 4h4l2 5-2 2a12 12 0 0 0 5 5l2-2 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 2 6a2 2 0 0 1 2-2z',
}

export function Icon({ path, color, size = 26 }: { path: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

export function Band({ color, height, bottom = 0, children }: {
  color: string; height: number; bottom?: number; children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', position: 'absolute', left: 0, bottom, width: 1080, height,
      backgroundColor: color, alignItems: 'center', paddingLeft: 60, paddingRight: 60,
    }}>
      {children}
    </div>
  )
}

export function PhotoCard({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- reason: satori no es DOM; rasteriza a SVG
    <img src={src} width={width} height={height} alt=""
         style={{ objectFit: 'cover', borderRadius: 14, boxShadow: '0 6px 20px rgba(0,0,0,0.28)' }} />
  )
}

export function Badge({ text, color }: { text: string; color: string }) {
  if (!text) return <span style={{ fontSize: 1, color }} />
  return (
    <span style={{ fontFamily: 'Marcellus', fontSize: 26, letterSpacing: 6, color }}>
      {text}
    </span>
  )
}

/**
 * Titular con énfasis alterno. El agente escribe texto plano — pedirle que
 * marque negritas sería pedirle que maquete. El ritmo lo decide el diseño:
 * destaca una palabra de cada dos.
 */
export function Headline({ text, color, size }: { text: string; color: string; size: number }) {
  const words = text.split(' ').filter(Boolean)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: 900 }}>
      {words.map((w, i) => (
        <span key={i} style={{
          fontFamily: 'Spectral',
          fontWeight: i % 2 === 0 ? 400 : 800,
          fontSize: size, lineHeight: 1.08, color, marginRight: 14,
        }}>
          {w}
        </span>
      ))}
    </div>
  )
}

export function StatRow({ stats, color }: { stats: Stat[]; color: string }) {
  if (stats.length === 0) return <span style={{ fontSize: 1, color }} />
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {stats.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', marginRight: 40 }}>
          <Icon path={ICONS[s.icon] ?? ICONS.ruler} color={color} />
          <span style={{ fontFamily: 'Spectral', fontSize: 27, color, marginLeft: 10 }}>{s.value}</span>
        </div>
      ))}
    </div>
  )
}

/**
 * La portada del agente, SIEMPRE dentro de un círculo que llena su hueco.
 *
 * Antes se usaba tal cual cuando el PNG traía transparencia, pero no todas las
 * fotos vienen bien recortadas y el resultado dependía de la calidad del archivo
 * que subiera cada agente. Un círculo con objectFit cover se ve igual de bien
 * con cualquier foto y no deja huecos: el diseño no puede depender de que el
 * usuario sepa editar imágenes.
 */
export function AgentBadge({ src, size, ring, right, bottom }: {
  src: string; size: number; ring: string; right: number; bottom: number
}) {
  // El borde va POR DENTRO del diámetro, no encima: satori no aplica
  // box-sizing:border-box, así que una imagen de `size` dentro de un contenedor
  // de `size` con borde de 6px se desborda por los cuatro lados y el recorte
  // circular queda descentrado. La imagen mide el hueco interior exacto.
  const ringWidth = 8
  const inner = size - ringWidth * 2

  return (
    <div style={{
      display: 'flex', position: 'absolute', right, bottom,
      width: inner, height: inner, borderRadius: inner / 2,
      border: `${ringWidth}px solid ${ring}`, overflow: 'hidden',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- reason: ídem PhotoCard */}
      <img src={src} width={inner} height={inner} alt=""
           style={{ objectFit: 'cover', borderRadius: inner / 2 }} />
    </div>
  )
}
