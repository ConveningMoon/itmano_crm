// El tipo de una edición. Es una ETIQUETA para el lector, no una estructura:
// no tiene público propio, ni secuencia propia, ni página propia. Si algún día
// necesitara cualquiera de esas tres cosas, habríamos reinventado las series.
//
// Puro y client-safe: lo usan el editor, la lista del CRM y la página pública.

export const NEWSLETTER_CATEGORIES = [
  'informativo', 'educativo', 'analisis', 'anuncio',
] as const

export type NewsletterCategory = typeof NEWSLETTER_CATEGORIES[number]

export const CATEGORY_LABELS: Record<NewsletterCategory, string> = {
  informativo: 'Informativo',
  educativo:   'Educativo',
  analisis:    'Análisis',
  anuncio:     'Anuncio',
}

const VALIDAS = new Set<string>(NEWSLETTER_CATEGORIES)

/**
 * Parse defensivo: una fila nunca debería traer otra cosa, pero si la trae no
 * puede tumbar la lista entera. `fallback` existe para quien tiene un valor
 * mejor que 'informativo' a mano cuando el crudo no sirve — por ejemplo, el
 * import de JSON externo, donde lo mejor a mano es lo que la persona eligió
 * en el selector del modal.
 */
export function parseCategory(raw: unknown, fallback: NewsletterCategory = 'informativo'): NewsletterCategory {
  return typeof raw === 'string' && VALIDAS.has(raw)
    ? (raw as NewsletterCategory)
    : fallback
}
