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
  event:       '',
  open_prompt: '',
}

export function badgeFor(recipe: StudioRecipe): string {
  return BADGES[recipe]
}

/** El titular del agente, o uno derivado del hecho si no lo escribió. */
export function defaultHeadline(form: StudioForm): string {
  if (form.headline) return form.headline
  switch (form.recipe) {
    case 'open_house':  return 'Casa abierta este fin de semana'
    case 'new_listing': return 'Nueva casa disponible'
    case 'sold':        return 'Otra familia en su nuevo hogar'
    default:            return ''
  }
}

export function statsFor(form: StudioForm): Stat[] {
  if (form.recipe !== 'new_listing') return []
  const out: Stat[] = []
  if (form.sqft !== undefined)      out.push({ icon: 'ruler', value: `${form.sqft.toLocaleString('en-US')} sqft` })
  if (form.bedrooms !== undefined)  out.push({ icon: 'bed',   value: `${form.bedrooms} hab` })
  if (form.bathrooms !== undefined) out.push({ icon: 'bath',  value: `${form.bathrooms} baños` })
  return out
}

/** La cifra, solo cuando la receta la muestra. Vendida puede ocultarla. */
export function priceFor(form: StudioForm): string | null {
  if (form.recipe === 'new_listing') return formatMoney(form.price)
  if (form.recipe === 'sold' && form.show_price && form.price !== undefined) return formatMoney(form.price)
  return null
}

/** Fecha y horario: el dato dominante de una casa abierta. */
export function whenFor(form: StudioForm): string | null {
  if (form.recipe !== 'open_house') return null
  return `${formatDate(form.date)} · ${form.time_start}–${form.time_end}`
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
}): Promise<TemplateProps> {
  const { form, brand } = params

  // Las fotos se bajan en paralelo, y una que falle no rompe la pieza: el
  // template pinta lo que haya.
  const raw = (await Promise.all(params.photoUrls.slice(0, 4).map(fetchImage)))
    .filter((b): b is Buffer => b !== null)
  const photos = (await Promise.all(raw.map(normalizePhoto)))
    .filter((u): u is string => u !== null)

  let agentPhoto: string | null = null
  if (params.agentPhoto) {
    const raw = await fetchImage(params.agentPhoto.url)
    if (raw) {
      // Recorte real → tal cual. Foto normal → círculo.
      agentPhoto = params.agentPhoto.cutout
        ? toDataUri(raw, 'image/png')
        : toDataUri(await circleCrop(raw, 480), 'image/png')
    }
  }

  const logoBuf = brand.logo_url ? await fetchImage(brand.logo_url) : null

  return {
    heroPhoto:   photos[0] ?? null,
    thumbPhotos: photos.slice(1),
    agentPhoto,
    logo:        logoBuf ? toDataUri(logoBuf, 'image/png') : null,
    headline:    defaultHeadline(form),
    price:       priceFor(form),
    when:        whenFor(form),
    address:     'address' in form ? form.address : null,
    phone:       brand.agent_phone,
    cta:         form.recipe === 'sold' ? (form.note ?? null) : null,
    badge:       badgeFor(form.recipe),
    stats:       statsFor(form),
    agentName:   brand.agent_name,
    palette: {
      primary: form.palette[0] ?? brand.primary_color,
      ink:     '#FFFFFF',
      surface: '#FBF6EE',
    },
  }
}
