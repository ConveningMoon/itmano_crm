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
  { key: 'ink',     label: 'Texto',            hint: 'Sobre el fondo' },
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
