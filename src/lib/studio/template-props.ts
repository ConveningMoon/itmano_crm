import 'server-only'
import sharp from 'sharp'
import { circleCrop } from './agent-photo'
import { formatDate, formatMoney } from './format'
import type { StudioForm } from './recipes'
import type { StudioBrand, StudioRecipe } from './types'
import type { Stat, TemplateProps } from './templates/types'

// Traduce el formulario + la marca + las fotos a lo que un template pinta.
// Vive separado de los templates para que los nueve compartan exactamente las
// mismas reglas de formato: una fecha o un precio no pueden verse distintos
// según el diseño elegido.

const BADGES: Record<StudioRecipe, string> = {
  open_house:  'CASA ABIERTA',
  new_listing: 'NUEVA DISPONIBLE',
  sold:        'VENDIDA',
  event:       'EVENTO',
  open_prompt: '',
}

/** El encabezado de la receta. Es el DEFAULT: `badgeOf` respeta el escrito. */
export function badgeFor(recipe: StudioRecipe): string {
  return BADGES[recipe]
}

/** El encabezado que se pinta: el que escribió el agente, o el de la receta. */
export function badgeOf(form: StudioForm): string {
  return form.badge || badgeFor(form.recipe)
}

/** El titular del agente, o uno derivado del hecho si no lo escribió. */
export function defaultHeadline(form: StudioForm): string {
  if (form.headline) return form.headline
  switch (form.recipe) {
    case 'open_house':  return 'Casa abierta este fin de semana'
    case 'new_listing': return 'Nueva casa disponible'
    case 'sold':        return 'Otra familia en su nuevo hogar'
    // El título ES el titular de un evento: no hay un segundo campo que
    // compita con él ni un texto por defecto que tenga sentido inventar.
    case 'event':       return form.title
    default:            return ''
  }
}

// Las etiquetas por defecto. "sqft" no significa nada fuera de Estados Unidos y
// "hab" no es lo que escribiría una agencia de Barcelona, así que cada una se
// puede reescribir desde el formulario.
const STAT_LABELS = { sqft: 'sqft', bedrooms: 'hab', bathrooms: 'baños' }

export function statsFor(form: StudioForm): Stat[] {
  if (form.recipe !== 'new_listing') return []
  const out: Stat[] = []
  if (form.sqft !== undefined) {
    out.push({ icon: 'ruler', value: `${form.sqft.toLocaleString('en-US')} ${form.sqft_label ?? STAT_LABELS.sqft}` })
  }
  if (form.bedrooms !== undefined) {
    out.push({ icon: 'bed', value: `${form.bedrooms} ${form.bedrooms_label ?? STAT_LABELS.bedrooms}` })
  }
  if (form.bathrooms !== undefined) {
    out.push({ icon: 'bath', value: `${form.bathrooms} ${form.bathrooms_label ?? STAT_LABELS.bathrooms}` })
  }
  return out
}

/**
 * La cifra, solo donde la receta la publica.
 *
 * Un cierre NO la publica: los tres diseños de "vendida" se llenaban de huecos
 * alrededor de un dato que casi ningún agente enseña, así que dejó de pedirse.
 */
export function priceFor(form: StudioForm): string | null {
  if (form.recipe === 'new_listing') return formatMoney(form.price)
  if (form.recipe === 'event' && form.price !== undefined) return formatMoney(form.price)
  return null
}

/** Fecha y horario: el dato dominante de una casa abierta y de un evento. */
export function whenFor(form: StudioForm): string | null {
  if (form.recipe === 'open_house') return `${formatDate(form.date)} · ${form.time_start}–${form.time_end}`
  if (form.recipe === 'event')      return `${formatDate(form.date)} · ${form.time_start}`
  return null
}

/** satori no debe hacer red: las imágenes entran ya codificadas. */
export function toDataUri(buffer: Buffer, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${buffer.toString('base64')}`
}

/**
 * Normaliza cualquier foto a JPEG antes de codificarla.
 *
 * Las fotos de una propiedad pueden ser JPEG, PNG o WebP, y el data URI declara
 * un mime: anunciar `image/jpeg` sobre bytes WebP es mentirle al renderizador.
 * De paso acota el tamaño — un data URI de 4 MB dentro del SVG es gratuito de
 * evitar. Si la imagen es ilegible devuelve null y el template pinta sin ella.
 */
export async function normalizePhoto(buffer: Buffer): Promise<string | null> {
  try {
    const jpeg = await sharp(buffer)
      .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 84 })
      .toBuffer()
    return toDataUri(jpeg, 'image/jpeg')
  } catch {
    return null
  }
}

/**
 * Repinta el logo con el color de marca para que la pieza sea armónica.
 *
 * Solo se tiñe si el archivo tiene transparencia real: la silueta se rellena con
 * el color y el fondo sigue vacío. Un logo SIN transparencia (fondo blanco) NO
 * se toca — teñirlo lo convertiría en un rectángulo de color sólido, que es peor
 * que dejarlo con sus colores originales.
 */
export async function tintLogo(buffer: Buffer, color: string): Promise<string | null> {
  try {
    const img = sharp(buffer)
    const { isOpaque } = await img.stats()
    if (isOpaque !== false) {
      // Sin transparencia no hay silueta que rellenar: se usa tal cual.
      return toDataUri(await img.png().toBuffer(), 'image/png')
    }

    const { width = 0, height = 0 } = await img.metadata()
    if (!width || !height) return toDataUri(await img.png().toBuffer(), 'image/png')

    // El canal alfa del logo hace de máscara sobre un lienzo del color de marca.
    const alpha = await sharp(buffer).ensureAlpha().extractChannel('alpha').toBuffer()
    const tinted = await sharp({
      create: { width, height, channels: 3, background: color },
    })
      .joinChannel(alpha)
      .png()
      .toBuffer()
    return toDataUri(tinted, 'image/png')
  } catch {
    return null
  }
}

async function fetchImage(url: string): Promise<Buffer | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function buildTemplateProps(params: {
  form:       StudioForm
  brand:      StudioBrand
  photoUrls:  string[]
  agentPhoto: { url: string; cutout: boolean } | null
  /** La escena generada con IA, cuando no se eligió propiedad. Entra como
   *  primera foto: para el diseño es el hero, venga de donde venga. */
  generatedHero?: Buffer | null
}): Promise<TemplateProps> {
  const { form, brand } = params

  // Las fotos se bajan en paralelo, y una que falle no rompe la pieza: el
  // template pinta lo que haya.
  const raw = (await Promise.all(params.photoUrls.slice(0, 4).map(fetchImage)))
    .filter((b): b is Buffer => b !== null)
  const photos = (await Promise.all(raw.map(normalizePhoto)))
    .filter((u): u is string => u !== null)

  if (params.generatedHero) {
    const uri = await normalizePhoto(params.generatedHero)
    if (uri) photos.unshift(uri)
  }

  let agentPhoto: string | null = null
  if (params.agentPhoto) {
    const raw = await fetchImage(params.agentPhoto.url)
    if (raw) {
      // SIEMPRE en círculo, venga recortada o no. Antes se usaba tal cual si el
      // PNG traía transparencia, y el resultado dependía de lo bien editada que
      // estuviera la foto de cada agente. El diseño no puede depender de eso.
      agentPhoto = toDataUri(await circleCrop(raw, 560), 'image/png')
    }
  }

  const logoBuf = brand.logo_url ? await fetchImage(brand.logo_url) : null
  // El logo se tiñe con SU rol, no con el primario: en los diseños va sobre el
  // fondo claro, y si fuera del color de las bandas se confundiría con ellas.
  const logo = logoBuf ? await tintLogo(logoBuf, form.palette.logo) : null

  return {
    heroPhoto:   photos[0] ?? null,
    thumbPhotos: photos.slice(1),
    agentPhoto,
    logo,
    headline:    defaultHeadline(form),
    price:       priceFor(form),
    when:        whenFor(form),
    // El evento no tiene dirección sino LUGAR, que ocupa el mismo hueco.
    address:     form.recipe === 'event' ? form.venue : ('address' in form ? form.address : null),
    phone:       brand.agent_phone,
    // Cómo apuntarse a un evento. La nota de un cierre se retiró del formulario.
    cta:         form.recipe === 'event' ? (form.signup ?? null) : null,
    badge:       badgeOf(form),
    stats:       statsFor(form),
    agentName:   brand.agent_name,
    // Los colores ya vienen por rol desde el formulario; aquí no se reinterpreta
    // nada. El texto sobre `brand` es siempre blanco y la banda secundaria es
    // `brand` oscurecido: eso lo derivan los templates.
    palette: form.palette,
  }
}
