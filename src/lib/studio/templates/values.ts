import { darken, textColors, type StudioPalette } from '../palettes'
import { HEADLINE_MAX } from '../recipes'
import { escapeHtml } from './document'
import type { TemplateProps } from './types'

// De los datos de la pieza a lo que la plantilla puede escribir. Tres salidas
// separadas porque son tres mecanismos distintos del contrato: los valores se
// sustituyen, las clases recolocan y las variables tiñen.

/**
 * Solo las claves CON dato.
 *
 * Que una clave ausente no exista en el mapa es lo que hace que
 * `{{#price}}…{{/price}}` funcione: la sección mira presencia, y una cadena
 * vacía significaría "hay precio" cuando no lo hay.
 */
export function templateValues(p: TemplateProps): Record<string, string> {
  const v: Record<string, string> = {}
  const put = (key: string, value: string | null | undefined) => {
    if (value) v[key] = value
  }

  put('hero', p.heroPhoto)
  p.thumbPhotos.slice(0, 3).forEach((src, i) => put(`thumb${i + 1}`, src))
  put('agentPhoto', p.agentPhoto)
  put('logo', p.logo)

  put('badge', p.badge)
  put('headline', p.headline)
  put('price', p.price)
  put('address', p.address)
  put('phone', p.phone)
  put('cta', p.cta)
  put('agentName', p.agentName)

  // La fecha entera y sus dos mitades. Un cartel se lee mejor con el día en una
  // línea y la hora en la siguiente, y el diseño decide cuál de las tres usa.
  put('when', p.when)
  if (p.when) {
    const [day, time] = p.when.split(' · ')
    put('whenDay', day)
    put('whenTime', time)
  }

  p.stats.slice(0, 3).forEach((s, i) => put(`stat${i + 1}`, s.value))
  // Las nombradas atan el icono a SU dato, no a la posición: sqft, bedrooms y
  // bathrooms son cada uno opcional por su cuenta (ver statsFor en
  // template-props.ts), así que un listado sin metros deja bedrooms en la
  // posición 1 — un diseño que pinte el icono de regla en stat1 pondría una
  // regla junto al número de habitaciones. Las ordinales se quedan para los
  // diseños que solo enumeran valores sin icono.
  const STAT_KEY_OF_ICON: Record<string, string> = {
    ruler: 'statSqft', bed: 'statBedrooms', bath: 'statBathrooms',
  }
  for (const s of p.stats) {
    const key = STAT_KEY_OF_ICON[s.icon]
    if (key) put(key, s.value)
  }
  return v
}

/**
 * Las clases del <html>. Sustituyen a `photoHeight(blocks)`: con ellas el CSS
 * puede reaccionar a CUÁNTO hay, no solo a qué falta.
 */
/**
 * En qué tramo de longitud cae el titular.
 *
 * Existe porque `datos-N` cuenta CUÁNTOS bloques hay, no cuánto ocupa uno: un
 * titular de 60 caracteres y otro de 20 dan el mismo `datos-5`, y el diseño no
 * tenía forma de distinguirlos. Con esto puede bajar el cuerpo de letra cuando
 * el titular es largo y mantenerlo en dos líneas.
 *
 * Los cortes se derivan de `HEADLINE_MAX` en vez de escribirse a mano: si algún
 * día el formulario admite más o menos, los tramos siguen repartidos igual y no
 * hay que acordarse de tocarlos.
 */
function tramoDelTitular(headline: string): string {
  const proporcion = headline.length / HEADLINE_MAX
  if (proporcion <= 0.4) return 'titular-corto'
  if (proporcion <= 0.7) return 'titular-medio'
  return 'titular-largo'
}

export function templateFlags(p: TemplateProps): string[] {
  const flags: string[] = []
  const missing = (value: unknown, name: string) => {
    if (!value) flags.push(name)
  }

  missing(p.heroPhoto, 'sin-hero')
  missing(p.agentPhoto, 'sin-foto-agente')
  missing(p.logo, 'sin-logo')
  missing(p.price, 'sin-precio')
  missing(p.when, 'sin-cuando')
  missing(p.address, 'sin-direccion')
  missing(p.phone, 'sin-telefono')
  missing(p.cta, 'sin-cta')
  missing(p.agentName, 'sin-agente')
  missing(p.stats.length, 'sin-specs')

  if (p.headline) flags.push(tramoDelTitular(p.headline))
  flags.push(`fotos-${(p.heroPhoto ? 1 : 0) + p.thumbPhotos.length}`)
  // Cuántos bloques de texto hay que leer. Es la cuenta que hacía el editorial
  // para decidir cuánto lienzo se llevaba la foto.
  const bloques = [
    p.badge, p.headline, p.price ?? p.when, p.address,
    p.stats.length ? 'stats' : null, p.cta,
  ].filter(Boolean).length
  flags.push(`datos-${bloques}`)

  return flags
}

/**
 * Fragmentos ya marcados, que entran SIN escapar con `{{&clave}}`.
 *
 * Hoy solo el titular con énfasis alterno. El agente escribe texto plano —
 * pedirle que marque negritas sería pedirle que maquete— y el ritmo lo decide el
 * diseño: destaca una palabra de cada dos. El CSS no puede hacerlo sobre una
 * cadena, así que el marcado tiene que llegar hecho.
 *
 * Cada palabra se escapa AQUÍ: lo que sale de esta función se inserta tal cual,
 * así que el escape es responsabilidad suya y de nadie más. Nunca metas por aquí
 * un dato del formulario sin pasarlo por `escapeHtml`.
 */
export function templateRawValues(p: TemplateProps): Record<string, string> {
  const raw: Record<string, string> = {}
  if (p.headline) {
    raw.headlineRitmo = p.headline
      .split(' ')
      .filter(Boolean)
      .map((palabra, i) =>
        `<span class="${i % 2 === 0 ? 'palabra' : 'palabra-fuerte'}">${escapeHtml(palabra)}</span>`)
      .join(' ')
  }
  return raw
}

/** Los colores de la pieza, como custom properties: `color: var(--on-brand)`. */
export function paletteVars(palette: StudioPalette): Record<string, string> {
  const { onBrand, onDark, onPhoto } = textColors(palette)
  return {
    'brand':      palette.brand,
    'brand-dark': darken(palette.brand),
    'ink':        palette.ink,
    'surface':    palette.surface,
    'logo':       palette.logo,
    'on-brand':   onBrand,
    'on-dark':    onDark,
    'on-photo':   onPhoto,
  }
}
