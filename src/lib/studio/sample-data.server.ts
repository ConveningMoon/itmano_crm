import 'server-only'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizePhoto, toDataUri } from './template-props'
import { sampleProps, type ScenarioKey } from './sample-data'
import { isFallbackUrl, type MockupMap } from './mockups'
import type { StudioRecipe } from './types'
import type { TemplateProps } from './templates/types'

// Los mismos escenarios con las fotos dentro del documento. La vista previa las
// pide por URL y el render las lleva en data: — mismos bytes, misma
// maquetación; lo único que cambia es el valor de un atributo.

const DIR = join(process.cwd(), 'public', 'studio', 'fixtures')

/**
 * Los bytes de una imagen de ejemplo, venga de donde venga.
 *
 * Las de reserva viven en el repo y se leen del disco; las que el autor subió
 * viven en el bucket y hay que bajarlas. El render corre en una función
 * serverless, así que la descarga lleva su propio corte: una imagen de ejemplo
 * que no responde no puede colgar la generación de una pieza.
 */
async function bytesDe(url: string): Promise<Buffer | null> {
  if (isFallbackUrl(url)) {
    try {
      return readFileSync(join(DIR, url.split('/').pop() ?? ''))
    } catch {
      return null
    }
  }
  const corte = new AbortController()
  const reloj = setTimeout(() => corte.abort(), 15000)
  try {
    const res = await fetch(url, { signal: corte.signal, cache: 'no-store' })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  } finally {
    clearTimeout(reloj)
  }
}

async function inline(url: string | null): Promise<string | null> {
  if (!url) return null
  const bytes = await bytesDe(url)
  return bytes ? normalizePhoto(bytes) : null
}

/**
 * El logo y la portada del agente van como PNG, no por `normalizePhoto`
 * (JPEG): en producción los dos llegan YA recortados con transparencia real
 * (`tintLogo`, `circleCrop`), y JPEG no tiene canal alfa — la transparencia se
 * convierte en un cuadro negro sólido detrás de la marca o de la cara. Las
 * fotos de la propiedad (hero, miniaturas) siguen por JPEG: son opacas y ahí
 * sí importa el peso del data URI.
 */
async function inlinePng(url: string | null): Promise<string | null> {
  if (!url) return null
  const bytes = await bytesDe(url)
  if (!bytes) return null
  try {
    return toDataUri(await sharp(bytes).png().toBuffer(), 'image/png')
  } catch {
    return null
  }
}

export async function samplePropsInlined(
  recipe: StudioRecipe,
  scenario: ScenarioKey,
  imagenes?: MockupMap,
): Promise<TemplateProps> {
  const p = sampleProps(recipe, scenario, imagenes)
  const [heroPhoto, agentPhoto, logo, ...thumbs] = await Promise.all([
    inline(p.heroPhoto), inlinePng(p.agentPhoto), inlinePng(p.logo),
    ...p.thumbPhotos.map(inline),
  ])
  return {
    ...p,
    heroPhoto, agentPhoto, logo,
    thumbPhotos: thumbs.filter((t): t is string => t !== null),
  }
}
