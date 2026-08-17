import { darken, readableOn, type StudioPalette } from '../palettes'
import type { Stat } from './types'

// Bloques compartidos por los nueve diseños. Existen para que las tres variantes
// de una receta se vean como la misma familia, y para que un ajuste de sombra o
// de radio se haga en un solo sitio.
//
// RECORDATORIO satori: todo elemento con MÁS DE UN HIJO necesita display:'flex'
// explícito, o el render lanza.

/**
 * Qué color lleva el texto según SOBRE QUÉ cae. Es la única fuente de esa
 * decisión para los nueve diseños.
 *
 * Vive aquí y no en cada template porque es una regla de producto, no de
 * maquetación, y ya se corrigió tres veces: repetida nueve veces, la próxima
 * corrección se aplicaría a ocho.
 */
export function textColors(palette: StudioPalette) {
  return {
    // Sobre el primario y sobre el primario oscurecido: SIEMPRE el secundario.
    // El color de texto no entra como alternativa — ese rol es para el fondo
    // claro—, así que la única salida es un neutro y solo si el secundario no
    // se lee. Ver readableOn.
    onBrand: readableOn(palette.brand, palette.surface),
    onDark:  readableOn(darken(palette.brand), palette.surface),
    // Sobre una foto velada por el degradado del primario: ahí sí manda el
    // color de texto, con el secundario detrás por si coinciden los hex.
    onPhoto: readableOn(palette.brand, palette.ink, palette.surface),
  }
}

/**
 * La fecha y el horario, en dos líneas.
 *
 * `when` llega como "15 de agosto de 2026 · 11:00–14:00": treinta y cinco
 * caracteres que en una sola línea se meten debajo de la portada del agente, y
 * con un mes largo —septiembre, diciembre— desbordan el bloque. Partirlo no es
 * solo defensa: un cartel se lee mejor con el día en una línea y la hora en la
 * siguiente.
 */
export function splitWhen(when: string | null): { day: string; time: string | null } {
  if (!when) return { day: '', time: null }
  const [day, time] = when.split(' · ')
  return { day, time: time ?? null }
}

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
        <div key={i} style={{ display: 'flex', alignItems: 'center', marginRight: 44 }}>
          {/* Los íconos de metros, habitaciones y baños son de los pocos datos
              que se leen de un vistazo en el feed: a 26px se perdían. */}
          <Icon path={ICONS[s.icon] ?? ICONS.ruler} color={color} size={40} />
          <span style={{ fontFamily: 'Spectral', fontSize: 31, color, marginLeft: 12 }}>{s.value}</span>
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
  // El anillo es el FONDO del contenedor, no un `border`, y no se recorta nada.
  //
  // Antes esto era un div con `border` + `overflow: hidden` + `borderRadius`, y
  // la foto se salía por el borde: satori no recorta de forma fiable con
  // overflow sobre esquinas redondeadas, así que quedaba un arco desbordado.
  // La imagen YA viene circular con las esquinas transparentes desde sharp
  // (circleCrop), así que no hace falta recortar: basta centrarla sobre un
  // círculo de color un poco más grande.
  const ringWidth = 8
  const inner = size - ringWidth * 2

  return (
    <div style={{
      display: 'flex', position: 'absolute', right, bottom,
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: ring,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- reason: ídem PhotoCard */}
      <img src={src} width={inner} height={inner} alt=""
           style={{ objectFit: 'cover', borderRadius: inner / 2 }} />
    </div>
  )
}
