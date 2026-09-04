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
    .filter((x) => x.length > 0)
}

/** Prosa que llega con marcado dentro: se limpia igual, o se deja tal cual. */
export function cleanProse(s: string): string {
  return /<[^>]+>/.test(s) ? stripMarkup(s) : s
}
