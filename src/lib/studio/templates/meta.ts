import type { StudioRecipe, Aspect } from '../types'
import type { FitReport, SlotKey } from './types'

// Lo que una plantilla es PARA EL CLIENTE: dato serializable, sin función de
// render. Las páginas de servidor lo cargan de la base y lo pasan por props,
// igual que ya hacen con propiedades y agentes.

export interface TemplateMeta {
  key:         string
  label:       string
  hint:        string
  recipes:     StudioRecipe[]
  aspects:     Aspect[]
  slots:       { required: SlotKey[]; optional: SlotKey[] }
  idealPhotos: number
  /** URL pública de la miniatura, o null mientras no se haya generado. */
  thumbUrl:    string | null
}

/**
 * Cruza lo que el diseño necesita con lo que el agente tiene.
 *
 * `usable: false` SOLO cuando falta algo sin lo cual el diseño no existe (una
 * foto para el hero). Todo lo demás es aviso: si quiere el mosaico con dos
 * fotos, es su decisión — lo que no puede es enterarse al ver el resultado.
 */
export function templateFit(
  template: Pick<TemplateMeta, 'slots' | 'idealPhotos'>,
  data: { photoCount: number; hasAgentPhoto: boolean },
): FitReport {
  const warnings: string[] = []
  const needsHero = template.slots.required.includes('photo.hero')

  if (data.photoCount < template.idealPhotos) {
    warnings.push(`Mejor con ${template.idealPhotos} fotos, tienes ${data.photoCount}`)
  }
  if (template.slots.optional.includes('photo.agent') && !data.hasAgentPhoto) {
    warnings.push('Sin portada del agente, ese espacio queda vacío')
  }

  return { usable: !needsHero || data.photoCount > 0, warnings }
}

export function templatesForRecipeIn(metas: TemplateMeta[], recipe: StudioRecipe): TemplateMeta[] {
  return metas.filter(t => t.recipes.includes(recipe))
}

export function findTemplateIn(metas: TemplateMeta[], key: string): TemplateMeta | null {
  return metas.find(t => t.key === key) ?? null
}
