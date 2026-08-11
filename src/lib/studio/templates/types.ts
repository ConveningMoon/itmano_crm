import type { StudioRecipe, Aspect } from '../types'

// Un template declara QUÉ NECESITA y CÓMO SE DIBUJA. La declaración no es
// documentación: el formulario pide solo los slots que el diseño usa, y el
// selector avisa del desajuste ANTES de renderizar.

export type SlotKey =
  | 'photo.hero' | 'photo.thumbs' | 'photo.agent'
  | 'text.headline' | 'text.price' | 'text.when' | 'text.address' | 'text.phone' | 'text.cta'
  | 'stats' | 'logo.tenant'
  // Marcas de cumplimiento (Equal Housing y brokerage). El slot existe en el
  // contrato pero NINGÚN template de esta entrega lo usa: hoy se renderiza el
  // logo del tenant vía 'logo.tenant', y el asset de Equal Housing sigue
  // pendiente de confirmación legal.
  | 'marks'

export interface Stat { icon: string; value: string }

/** Todo lo que un template puede pintar. Los opcionales pueden venir vacíos. */
export interface TemplateProps {
  // Fotos ya descargadas y convertidas a data URI — satori no debe hacer red
  // dentro del render.
  heroPhoto:   string | null
  thumbPhotos: string[]
  agentPhoto:  string | null
  logo:        string | null

  headline: string
  price:    string | null
  // Fecha y horario ya formateados. Es el slot dominante de casa abierta, donde
  // los diseños de venta ponen el precio.
  when:     string | null
  address:  string | null
  phone:    string | null
  cta:      string | null
  badge:    string          // "CASA ABIERTA", "NUEVA DISPONIBLE"…
  stats:    Stat[]

  agentName: string | null
  palette:   { primary: string; ink: string; surface: string }
}

export interface StudioTemplate {
  key:     string
  label:   string
  hint:    string
  recipes: StudioRecipe[]
  aspects: Aspect[]
  slots:   { required: SlotKey[]; optional: SlotKey[] }
  /** Cuántas fotos luce mejor. Solo alimenta el aviso de encaje. */
  idealPhotos: number
  render:  (props: TemplateProps) => React.ReactElement
}

export interface FitReport {
  /** false solo cuando falta algo sin lo que el diseño no puede existir. */
  usable:   boolean
  warnings: string[]
}
