import type { StudioRecipe } from '../types'
import type { FitReport, StudioTemplate } from './types'
import { mosaicoListing } from './mosaico-listing'
import { completaListing } from './completa-listing'
import { editorialListing } from './editorial-listing'
import { mosaicoOpenHouse } from './mosaico-open-house'
import { completaOpenHouse } from './completa-open-house'
import { editorialOpenHouse } from './editorial-open-house'
import { mosaicoSold } from './mosaico-sold'
import { completaSold } from './completa-sold'
import { editorialSold } from './editorial-sold'
import { agendaEvent } from './agenda-event'
import { completaEvent } from './completa-event'
import { editorialEvent } from './editorial-event'

// El registro es explícito, no un glob: importar por nombre hace que un template
// roto sea un error de compilación y no una ausencia silenciosa en el selector.
//
// Tres variantes por receta, en el mismo orden en las tres: el agente que ya
// eligió "Mosaico" para una casa abierta lo encuentra en el mismo sitio cuando
// publique la venta.
export const TEMPLATES: StudioTemplate[] = [
  mosaicoListing,
  completaListing,
  editorialListing,
  mosaicoOpenHouse,
  completaOpenHouse,
  editorialOpenHouse,
  mosaicoSold,
  completaSold,
  editorialSold,
  // Evento no lleva Mosaico: sin galería de propiedad no hay cuatro fotos que
  // repartir. Su tercera opción es Agenda, que no usa ninguna.
  agendaEvent,
  completaEvent,
  editorialEvent,
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
