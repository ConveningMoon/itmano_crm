import type { StudioRecipe } from '../types'
import type { FitReport, StudioTemplate } from './types'
import { mosaicoListing } from './mosaico-listing'
import { completaListing } from './completa-listing'
import { editorialListing } from './editorial-listing'

// El registro es explícito, no un glob: importar por nombre hace que un template
// roto sea un error de compilación y no una ausencia silenciosa en el selector.
export const TEMPLATES: StudioTemplate[] = [
  mosaicoListing,
  completaListing,
  editorialListing,
]

export function templatesForRecipe(recipe: StudioRecipe): StudioTemplate[] {
  return TEMPLATES.filter(t => t.recipes.includes(recipe))
}

export function findTemplate(key: string): StudioTemplate | null {
  return TEMPLATES.find(t => t.key === key) ?? null
}

/**
 * Cruza lo que el diseño necesita con lo que el agente tiene.
 *
 * `usable: false` SOLO cuando falta algo sin lo cual el diseño no existe (una
 * foto para el hero). Todo lo demás es aviso: si quiere el mosaico con dos
 * fotos, es su decisión — lo que no puede es enterarse al ver el resultado.
 *
 * Los avisos hablan de CANTIDAD. `photoCount` no dice si las fotos son buenas,
 * y sugerir un juicio de calidad que el sistema no hace sería mentir.
 */
export function templateFit(
  template: StudioTemplate,
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
