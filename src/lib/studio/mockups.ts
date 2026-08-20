// Las imágenes con las que se DISEÑA: el material de relleno de la vista previa
// del editor, no contenido de producto. Una pieza real usa las fotos de la
// propiedad; aquí sólo hace falta algo con lo que juzgar el diseño.
//
// Las claves son las MISMAS que el HTML escribe (`{{hero}}`, `{{thumb1}}`…), y
// por eso el panel del editor puede enseñar exactamente los huecos que cada
// diseño usa sin que nadie los declare: salen de leer su propio HTML.
//
// Cada hueco trae su imagen de reserva en el repo, así que un entorno recién
// clonado —o uno donde nadie haya subido nada— dibuja igual. Lo que se suba
// vive en el bucket y gana sobre la de reserva.

export interface MockupSlot {
  /** La clave que el HTML escribe. */
  key:   string
  /** Cómo se llama en el panel. */
  label: string
  /** Qué es, para que se entienda dónde acaba en la pieza. */
  hint:  string
  /** La del repo, cuando no hay ninguna subida. */
  fallback: string
  /**
   * Si su transparencia hay que conservarla.
   *
   * El logo y la portada del agente llegan recortados con alfa real, y pasarlos
   * por JPEG convierte esa transparencia en un cuadro negro — ya mordió una vez.
   * Las fotos de propiedad son opacas y van a JPEG, donde el peso sí importa.
   */
  keepsAlpha: boolean
}

const FIXTURES = '/studio/fixtures'

export const MOCKUP_SLOTS: MockupSlot[] = [
  { key: 'hero',       label: 'Foto principal',      hint: 'La que manda en la pieza',
    fallback: `${FIXTURES}/casa-fachada.webp`,   keepsAlpha: false },
  { key: 'thumb1',     label: 'Miniatura 1',         hint: 'Primera del mosaico',
    fallback: `${FIXTURES}/casa-salon.webp`,     keepsAlpha: false },
  { key: 'thumb2',     label: 'Miniatura 2',         hint: 'Segunda del mosaico',
    fallback: `${FIXTURES}/casa-comedor.webp`,   keepsAlpha: false },
  { key: 'thumb3',     label: 'Miniatura 3',         hint: 'Tercera del mosaico',
    fallback: `${FIXTURES}/casa-atardecer.webp`, keepsAlpha: false },
  { key: 'agentPhoto', label: 'Retrato del agente',  hint: 'Va recortado en círculo',
    fallback: `${FIXTURES}/agente-ejemplo.webp`, keepsAlpha: true },
  { key: 'logo',       label: 'Logo del cliente',    hint: 'Se tiñe con el color de marca',
    fallback: `${FIXTURES}/logo-ejemplo.webp`,   keepsAlpha: true },
]

export type MockupMap = Record<string, string>

export function mockupSlot(key: string): MockupSlot | null {
  return MOCKUP_SLOTS.find(s => s.key === key) ?? null
}

/** Sólo las de reserva. Es lo que se usa cuando nadie ha subido nada. */
export function fallbackMockups(): MockupMap {
  return Object.fromEntries(MOCKUP_SLOTS.map(s => [s.key, s.fallback]))
}

/**
 * Lo subido gana; lo que falte cae a la de reserva.
 *
 * Nunca devuelve un hueco vacío a propósito: una vista previa sin imagen haría
 * parecer roto un diseño que no lo está. La ausencia se cuenta en el panel, que
 * para eso sabe cuáles son propias.
 */
export function resolveMockups(overrides: MockupMap): MockupMap {
  const out = fallbackMockups()
  for (const slot of MOCKUP_SLOTS) {
    const subida = overrides[slot.key]
    if (subida) out[slot.key] = subida
  }
  return out
}

/** Si esa URL es una de las del repo (se lee del disco) o una subida (se baja). */
export function isFallbackUrl(url: string): boolean {
  return url.startsWith(FIXTURES)
}
