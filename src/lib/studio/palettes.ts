// Los colores de una pieza, por ROL y no como una lista suelta.
//
// Antes había un array de hasta cuatro hex del que solo se usaba el primero: el
// resto se descartaba en silencio y nada decía para qué servía ninguno. "Elige
// colores" no es una pregunta respondible — "¿de qué color son las bandas?" sí.
//
// Cuatro roles, que es lo que los diseños realmente pintan:
//   brand   → bandas y bloques de color. El color con el que se reconoce la marca.
//   surface → el fondo sobre el que se lee el texto.
//   ink     → el texto sobre ese fondo.
//   logo    → con qué color se tiñe el logo del equipo.
// El texto sobre `brand` es siempre blanco y la segunda banda es `brand`
// oscurecido: son derivados, no decisiones del usuario.
//
// `logo` es aparte de `brand` porque el logo casi nunca va sobre el color de
// marca —ahí desaparecería— y hay marcas cuyo isotipo pide su propio color.
// Por defecto sigue al primario, que es como se teñía antes de existir el rol.

export interface StudioPalette {
  brand:   string
  surface: string
  ink:     string
  logo:    string
}

export const PALETTE_ROLES: { key: keyof StudioPalette; label: string; hint: string }[] = [
  { key: 'brand',   label: 'Color primario',   hint: 'Bandas y bloques de color' },
  { key: 'surface', label: 'Color secundario', hint: 'El fondo donde va el texto' },
  { key: 'ink',     label: 'Color de texto',   hint: 'Sobre el fondo' },
  { key: 'logo',    label: 'Color de logo',    hint: 'Con el que se tiñe el logo del equipo' },
]

export const DEFAULT_PALETTE: StudioPalette = {
  brand:   '#1B2A41',
  surface: '#FBF6EE',
  ink:     '#1B2A41',
  logo:    '#1B2A41',
}

export interface PalettePreset {
  key:     string
  label:   string
  palette: StudioPalette
}

// Combinaciones que funcionan juntas, para que elegir colores sea un clic y no
// tres decisiones de diseño. "Marca del equipo" no está aquí: se arma en runtime
// con tenants.primary_color, porque es dato del tenant y no puede vivir en código.
export const PALETTE_PRESETS: PalettePreset[] = [
  { key: 'navy',    label: 'Navy y crema',    palette: { brand: '#1B2A41', surface: '#FBF6EE', ink: '#1B2A41', logo: '#1B2A41' } },
  { key: 'carbon',  label: 'Carbón y arena',  palette: { brand: '#2B2B28', surface: '#F2EDE4', ink: '#2B2B28', logo: '#2B2B28' } },
  { key: 'bosque',  label: 'Verde bosque',    palette: { brand: '#24433A', surface: '#F1F0E7', ink: '#1E3A32', logo: '#24433A' } },
  { key: 'terra',   label: 'Terracota',       palette: { brand: '#8C4A32', surface: '#FAF1E8', ink: '#4A2318', logo: '#8C4A32' } },
  { key: 'noche',   label: 'Azul noche',      palette: { brand: '#152238', surface: '#E9EDF2', ink: '#152238', logo: '#152238' } },
]

/** El preset del tenant, armado con su color de marca. Siempre el primero. */
export function tenantPreset(primaryColor: string): PalettePreset {
  return {
    key: 'tenant',
    label: 'Marca del equipo',
    palette: {
      brand:   primaryColor,
      surface: DEFAULT_PALETTE.surface,
      ink:     DEFAULT_PALETTE.ink,
      logo:    primaryColor,
    },
  }
}

/** Los hex sueltos, para el prompt de escena del camino con IA. `logo` no entra:
 *  el logo lo pinta el compositor, la escena no lo ve. */
export function paletteHexes(p: StudioPalette): string[] {
  return [p.brand, p.surface, p.ink]
}

/**
 * La paleta como la guarda la columna `studio_images.palette`, que es `text[]`
 * desde la migración 093 y sigue siéndolo.
 *
 * Cuando los colores pasaron a tener roles, el pipeline empezó a insertar el
 * objeto entero en esa columna y CADA guardado fallaba con "expected JSON
 * array" — sin que se notara, porque previsualizar no escribe en la base. Los
 * roles viven en `form_json`, que es jsonb; esta columna es la lista plana para
 * inspección, en orden de rol.
 */
export function paletteRow(p: StudioPalette): string[] {
  return [p.brand, p.surface, p.ink, p.logo]
}

/** El mismo color, más oscuro. La segunda banda se deriva, no se pide. */
export function darken(hex: string, factor = 0.62): string {
  const n = parseInt(hex.replace('#', ''), 16)
  if (!Number.isFinite(n)) return hex
  const r = Math.round(((n >> 16) & 255) * factor)
  const g = Math.round(((n >> 8) & 255) * factor)
  const b = Math.round((n & 255) * factor)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

/**
 * El mismo color con transparencia, para los degradados.
 *
 * Existe porque un degradado sobre una foto no puede ser un hex plano: necesita
 * ir de invisible a opaco. Un hex inválido cae a negro, que es el
 * comportamiento que tenía el degradado cuando estaba escrito a mano.
 */
export function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  if (!Number.isFinite(n)) return `rgba(0,0,0,${alpha})`
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`
}

/** Luminancia relativa WCAG. Es la base del contraste; no se usa sola. */
function luminance(hex: string): number {
  const n = parseInt(hex.replace('#', ''), 16)
  if (!Number.isFinite(n)) return 0
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

/** Razón de contraste entre dos colores: 1 (idénticos) a 21 (negro y blanco). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/**
 * Por debajo de esto el texto deja de leerse.
 *
 * NO es el 3:1 de WCAG: ese mínimo se define para texto de 14–18 pt, y lo que
 * estos diseños ponen sobre un color son 62–78 px sobre un lienzo de 1080. A
 * ese tamaño, 3:1 descarta pares perfectamente legibles — el crema sobre el
 * verde de un tenant real da 2,30 — y descartarlos significa cambiarle el color
 * que eligió por un blanco que no pidió.
 *
 * El fallo que esta guarda existe para evitar no es el contraste justo, es el
 * contraste NULO: dos roles con el mismo hex, que es lo que trae la paleta por
 * defecto (primario y color de texto son el mismo navy) y da 1,00.
 */
const MIN_CONTRAST = 2

/**
 * El color que DE VERDAD se lee sobre `bg`: el preferido si contrasta, y si no
 * el primer alternativo que sí.
 *
 * Existe porque los roles pueden coincidir sin que nadie se equivoque: la
 * paleta por defecto —y el preset del tenant— usan el mismo hex para el
 * primario y para el texto, así que un diseño que ponga el texto sobre el color
 * primario lo haría invisible. Preferir el rol pedido y degradar solo cuando no
 * se lee respeta la elección del usuario sin publicar una pieza ilegible.
 */
export function readableOn(bg: string, preferred: string, ...fallbacks: string[]): string {
  for (const color of [preferred, ...fallbacks]) {
    if (contrastRatio(bg, color) >= MIN_CONTRAST) return color
  }
  // Ninguno sirve: blanco o negro según lo oscuro que sea el fondo.
  return luminance(bg) > 0.4 ? '#000000' : '#FFFFFF'
}

/** El nombre del preset que coincide, o "Personalizada". Un resumen con tres
 *  hex crudos no le dice nada a nadie. */
export function paletteLabel(p: StudioPalette, tenantColor: string): string {
  const match = [tenantPreset(tenantColor), ...PALETTE_PRESETS].find(x => samePalette(x.palette, p))
  return match?.label ?? 'Personalizada'
}

/** Dos paletas son la misma si coinciden los CUATRO roles. */
export function samePalette(a: StudioPalette, b: StudioPalette): boolean {
  return a.brand === b.brand && a.surface === b.surface && a.ink === b.ink && a.logo === b.logo
}

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
