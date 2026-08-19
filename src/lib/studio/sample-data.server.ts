import 'server-only'
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizePhoto, toDataUri } from './template-props'
import { sampleProps, type ScenarioKey } from './sample-data'
import type { StudioRecipe } from './types'
import type { TemplateProps } from './templates/types'

// Los mismos escenarios con las fotos dentro del documento. La vista previa las
// pide por URL y el render las lleva en data: — mismos bytes, misma
// maquetación; lo único que cambia es el valor de un atributo.

const DIR = join(process.cwd(), 'public', 'studio', 'fixtures')

function fixturePath(url: string): string {
  return join(DIR, url.split('/').pop() ?? '')
}

async function inline(url: string | null): Promise<string | null> {
  if (!url) return null
  return normalizePhoto(readFileSync(fixturePath(url)))
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
  try {
    const png = await sharp(readFileSync(fixturePath(url))).png().toBuffer()
    return toDataUri(png, 'image/png')
  } catch {
    return null
  }
}

export async function samplePropsInlined(
  recipe: StudioRecipe, scenario: ScenarioKey,
): Promise<TemplateProps> {
  const p = sampleProps(recipe, scenario)
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
