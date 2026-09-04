// Saneo del texto que devuelve la extracción de propiedades con IA.
//
// Vive fuera de `ai-actions.ts` porque ese archivo es `'use server'` y sólo
// puede exportar funciones async: aquí estas dos son puras y se pueden probar.
//
// El motivo de que existan: el modelo no siempre respeta el tipo del esquema.
// Una lista declarada como `array` de strings ha llegado de cuatro formas
// distintas, y la que se ve en producción es la peor — un único string con los
// elementos serializados como XML:
//
//   <value>Cocina renovada</value>\n<value>Techo nuevo (2024)</value>
//
// Antes de este saneo eso salía como `[]` (el código exigía un array) y el
// formulario quedaba sin características; después de aceptarlo como texto,
// salía con las etiquetas dentro. Las dos veces sin ningún error.

/**
 * Quita el marcado de un texto que debería ser llano y decodifica las entidades
 * que trae ese mismo formato.
 *
 * Un dato de una ficha inmobiliaria nunca contiene una etiqueta legítima, así
 * que se limpian todas sin intentar distinguir cuáles son "de verdad".
 */
export function stripMarkup(s: string): string {
  const ENTIDADES: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ',
  }
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_, e: string) => ENTIDADES[e] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Palabras con las que empieza un fragmento de PROSA, no un elemento de una
// enumeración. Son la diferencia entre "lavavajillas, microondas, nevera" (tres
// características) y "cocina renovada, incluyendo nevera nueva" (una sola).
const CONECTOR = /^(y|e|o|u|con|sin|más|además|incluyendo|incluye|así como|junto|and|with|including|plus|as well as)\b/i

/**
 * Un elemento que en realidad son varios unidos por comas se separa; uno que
 * lleva comas porque es una frase, no.
 *
 * El modelo junta las enumeraciones de la ficha ("Appliances: Dishwasher,
 * Microwave, Refrigerator") en un solo elemento, y entonces el formulario
 * muestra una línea con comas donde deberían ir tres.
 *
 * Separar por comas a ciegas es peor que no separar: parte en trozos sin
 * sentido cualquier característica con una coma legítima. Por eso sólo se
 * separa cuando TODO apunta a una enumeración — al menos dos separadores, y
 * cada fragmento una frase corta que no empieza por un conector. Ante la duda,
 * el elemento se deja como está: una línea de más se corrige en dos segundos;
 * una característica partida por la mitad se publica rota.
 */
export function splitEnumeration(item: string): string[] {
  const partes = item.split(/\s*[;,]\s*/).map(p => p.trim())
  if (partes.length < 3) return [item]
  if (partes.some(p => p.length < 2 || p.length > 45)) return [item]
  if (partes.some(p => p.split(/\s+/).length > 5)) return [item]
  if (partes.some(p => CONECTOR.test(p))) return [item]
  return partes
}

/**
 * Convierte en lista lo que el modelo haya devuelto: array de strings, array de
 * objetos (`{text}`/`{value}`/`{label}`/`{feature}`), un string con un elemento
 * por línea, o ese string serializado como XML.
 *
 * Los elementos etiquetados mandan sobre el corte por líneas: varios pueden
 * venir en una sola línea, y cortar por saltos los dejaría pegados en uno solo.
 */
export function toList(v: unknown): string[] {
  let items: unknown[]
  if (Array.isArray(v)) {
    items = v
  } else if (typeof v === 'string') {
    const etiquetados = [...v.matchAll(/<([a-zA-Z][\w:.-]*)\b[^>]*>([\s\S]*?)<\/\1>/g)].map(m => m[2])
    items = etiquetados.length > 0 ? etiquetados : v.split(/\r?\n|(?<=\S)\s*[•·]\s*/)
  } else {
    items = []
  }
  return items
    .map((x) => {
      if (typeof x === 'string') return x
      if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>
        const cand = o.text ?? o.value ?? o.label ?? o.feature
        return typeof cand === 'string' ? cand : ''
      }
      return ''
    })
    .map((x) => stripMarkup(x).replace(/^\s*[-–—*•]\s*/, '').trim())
    .flatMap(splitEnumeration)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
}

/** Prosa que llega con marcado dentro: se limpia igual, o se deja tal cual. */
export function cleanProse(s: string): string {
  return /<[^>]+>/.test(s) ? stripMarkup(s) : s
}
