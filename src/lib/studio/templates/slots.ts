import type { SlotKey } from './types'

// De qué necesita un diseño no se declara: se lee de lo que usa. Declararlo
// aparte crearía una segunda fuente de verdad capaz de contradecir al HTML, y
// el aviso de encaje —que se da ANTES de renderizar— dejaría de ser cierto.
//
// La regla es la del contrato: `{{clave}}` suelta significa que el diseño la
// necesita; `{{#clave}}` significa que el autor ya previó su ausencia.

const SLOT_OF: Record<string, SlotKey> = {
  hero:       'photo.hero',
  thumb1:     'photo.thumbs',
  thumb2:     'photo.thumbs',
  thumb3:     'photo.thumbs',
  agentPhoto: 'photo.agent',
  headline:      'text.headline',
  headlineRitmo: 'text.headline',
  price:      'text.price',
  when:       'text.when',
  whenDay:    'text.when',
  whenTime:   'text.when',
  address:    'text.address',
  phone:      'text.phone',
  cta:        'text.cta',
  stat1:      'stats',
  stat2:      'stats',
  stat3:      'stats',
  logo:       'logo.tenant',
}

const THUMB_KEYS = ['thumb1', 'thumb2', 'thumb3']

const SECTION_RE = /\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g

function keysInSections(html: string): Set<string> {
  const out = new Set<string>()
  for (const match of html.matchAll(SECTION_RE)) {
    out.add(match[1])
    for (const inner of match[2].matchAll(/\{\{&?([\w.]+)\}\}/g)) out.add(inner[1])
  }
  return out
}

// Una clave puede repetirse suelta y también dentro de una sección (el autor
// muestra el precio arriba y lo repite en un bloque condicional). Para saber
// si sigue siendo requerida hay que mirar las apariciones, no solo el nombre:
// se quita el contenido de las secciones y se busca lo que queda fuera.
function keysLoose(html: string): Set<string> {
  const withoutSections = html.replace(SECTION_RE, '')
  return new Set([...withoutSections.matchAll(/\{\{&?([\w.]+)\}\}/g)].map(m => m[1]))
}

export function inferSlots(html: string): { required: SlotKey[]; optional: SlotKey[]; idealPhotos: number } {
  const optionalKeys = keysInSections(html)
  const looseKeys = keysLoose(html)
  // El `&?` reconoce los fragmentos: `{{&headlineRitmo}}` es el titular igual
  // que `{{headline}}`, y sin esto un diseño que solo use el ritmo no declararía
  // el slot del titular.
  const allKeys = new Set([...html.matchAll(/\{\{[#&/]?([\w.]+)\}\}/g)].map(m => m[1]))

  const required = new Set<SlotKey>()
  const optional = new Set<SlotKey>()
  for (const key of allKeys) {
    const slot = SLOT_OF[key]
    if (!slot) continue
    if (looseKeys.has(key)) required.add(slot)
    if (optionalKeys.has(key)) optional.add(slot)
  }
  // Un slot requerido por una clave y opcional por otra es requerido: basta que
  // el diseño lo use suelto una vez para que su ausencia deje un hueco.
  for (const slot of required) optional.delete(slot)

  const usesHero = allKeys.has('hero')
  const thumbs = THUMB_KEYS.filter(k => allKeys.has(k)).length
  const idealPhotos = usesHero ? 1 + thumbs : 0

  return { required: [...required], optional: [...optional], idealPhotos }
}
