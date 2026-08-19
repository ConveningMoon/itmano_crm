import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { normalizePhoto } from './template-props'
import { sampleProps, type ScenarioKey } from './sample-data'
import type { StudioRecipe } from './types'
import type { TemplateProps } from './templates/types'

// Los mismos escenarios con las fotos dentro del documento. La vista previa las
// pide por URL y el render las lleva en data: — mismos bytes, misma
// maquetación; lo único que cambia es el valor de un atributo.

const DIR = join(process.cwd(), 'public', 'studio', 'fixtures')

async function inline(url: string | null): Promise<string | null> {
  if (!url) return null
  return normalizePhoto(readFileSync(join(DIR, url.split('/').pop() ?? '')))
}

export async function samplePropsInlined(
  recipe: StudioRecipe, scenario: ScenarioKey,
): Promise<TemplateProps> {
  const p = sampleProps(recipe, scenario)
  const [heroPhoto, agentPhoto, logo, ...thumbs] = await Promise.all([
    inline(p.heroPhoto), inline(p.agentPhoto), inline(p.logo),
    ...p.thumbPhotos.map(inline),
  ])
  return {
    ...p,
    heroPhoto, agentPhoto, logo,
    thumbPhotos: thumbs.filter((t): t is string => t !== null),
  }
}
