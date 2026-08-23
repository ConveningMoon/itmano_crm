import { fallbackMockups, type MockupMap } from './mockups'
import { DEFAULT_PALETTE } from './palettes'
import { badgeFor } from './badges'
import type { StudioRecipe } from './types'
import type { TemplateProps } from './templates/types'

// Los datos con los que se diseña. Única fuente para el test de plantillas, la
// vista previa del editor y la miniatura del selector.
//
// Hay VARIOS escenarios porque la mitad difícil de una plantilla es lo que pasa
// cuando un dato falta: una vista previa con todo relleno no enseña
// precisamente eso. Son casos estructurales, no contenido — por eso viven en
// código sin traicionar el "editar sin desplegar", que es sobre el diseño.
//
// Las fotos van por URL: el iframe del editor las pide al servidor de Next. Para
// el render, sample-data.server.ts las convierte a data URI — mismos bytes.


export type ScenarioKey = 'completo' | 'minimo' | 'titular-largo' | 'sin-agente'

export const SCENARIOS: Array<{ key: ScenarioKey; label: string }> = [
  { key: 'completo',      label: 'Completo' },
  { key: 'minimo',        label: 'Mínimo' },
  { key: 'titular-largo', label: 'Titular en el límite (60)' },
  { key: 'sin-agente',    label: 'Sin foto de agente' },
]

const HEADLINES: Record<StudioRecipe, string> = {
  new_listing: 'Casa elegante y familiar en venta',
  open_house:  'Te esperamos este sábado',
  sold:        'Otra familia en su nuevo hogar',
  event:       'Seminario para compradores primerizos',
  open_prompt: '',
}

// Exactamente HEADLINE_MAX caracteres: el titular más largo que un agente
// PUEDE escribir. Antes eran 91 — un 52% por encima del límite del formulario—,
// así que los ocho diseños se ajustaron contra un caso que no puede ocurrir y
// el peor caso real nunca se probó.
const LARGO = 'Casa de cuatro habitaciones con jardín y garaje en el centro'

/**
 * Los datos con los que se dibuja la vista previa.
 *
 * `imagenes` es el juego de mockups ya resuelto (lo subido, o las de reserva
 * del repo). Se recibe en vez de leerse aquí para que esta función siga siendo
 * pura y síncrona: la usan el editor —en el navegador, a cada tecla— y el
 * servidor cuando genera la miniatura, y ninguno de los dos puede permitirse
 * que consulte un bucket.
 */
export function sampleProps(
  recipe: StudioRecipe,
  scenario: ScenarioKey,
  imagenes: MockupMap = fallbackMockups(),
): TemplateProps {
  const esVenta  = recipe === 'new_listing'
  const esEvento = recipe === 'event'
  const minimo   = scenario === 'minimo'
  const sinAgente = scenario === 'sin-agente' || minimo

  return {
    heroPhoto:   imagenes.hero,
    thumbPhotos: minimo ? [] : [imagenes.thumb1, imagenes.thumb2, imagenes.thumb3],
    agentPhoto:  sinAgente ? null : imagenes.agentPhoto,
    logo:        minimo ? null : imagenes.logo,

    headline: scenario === 'titular-largo' ? LARGO : HEADLINES[recipe],
    // Solo una venta publica cifra: un cierre dejó de hacerlo, una casa abierta
    // nunca la tuvo y un evento dejó de pedirla.
    price:    esVenta && !minimo ? '$274,400' : null,
    when:     recipe === 'open_house' ? '15 de agosto de 2026 · 11:00–14:00'
            : esEvento ? '1 de septiembre de 2026 · 18:00'
            : null,
    // En un evento este hueco lo ocupa el LUGAR.
    address:  minimo ? null : (esEvento ? 'Centro Comunitario Ghent' : '1909 Ocean View Avenue, Norfolk, VA'),
    phone:    minimo ? null : '+1 757 555 0199',
    cta:      esEvento ? 'Regístrate en itmano.com/eventos' : null,
    badge:    badgeFor(recipe),
    stats: esVenta && !minimo
      ? [
          { icon: 'ruler', value: '1,548 sqft' },
          { icon: 'bed',   value: '3 hab' },
          { icon: 'bath',  value: '2 baños' },
        ]
      : [],
    agentName: sinAgente ? null : 'Adriana Jiménez',
    palette:   DEFAULT_PALETTE,
  }
}
