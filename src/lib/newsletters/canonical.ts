import { hostedNewsletterUrl } from '@/lib/hosted-page'

// Resolución del canonical de una edición. PURO: sin server-only, sin red — lo
// consumen la página pública, el sitemap y el formulario de Ajustes.
//
// La decisión (spec D1): el activo SEO es del cliente, así que cuando tiene su
// propia web mostrando las ediciones, la URL canónica es la SUYA y
// news.itmano.com queda como copia sindicada. Sin web propia, la canónica es la
// nuestra y no hay nada que decidir.
//
// Se guarda una PLANTILLA y no un origen (spec D2) porque no sabemos qué ruta
// usa el sitio del cliente. Adivinar `/newsletter/<slug>` produciría canonicals
// a un 404, que es peor que no ponerlos.

export const CANONICAL_TEMPLATE_SLOT = '{slug}'

/**
 * Valida una plantilla de canonical. La cadena vacía es válida y significa
 * "sin configurar" — no es un error del usuario que borra el campo.
 */
export function parseCanonicalTemplate(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim()
  if (!value) return { ok: true, value: '' }

  if (!value.startsWith('https://')) {
    return { ok: false, error: 'La dirección debe ser una URL absoluta que empiece por https://' }
  }
  if (!value.includes(CANONICAL_TEMPLATE_SLOT)) {
    // Sin el marcador, todas las ediciones declararían la misma canónica y
    // Google colapsaría el archivo entero en una sola página.
    return { ok: false, error: 'La dirección debe incluir {slug}, donde tu web pone el identificador de la edición.' }
  }
  try {
    // Con el marcador sustituido para que sea una URL real y parseable.
    new URL(value.split(CANONICAL_TEMPLATE_SLOT).join('x'))
  } catch {
    return { ok: false, error: 'La dirección no es una URL válida.' }
  }
  return { ok: true, value }
}

/** true si la plantilla está configurada Y es usable. */
export function isExternalCanonical(template: string | null): boolean {
  if (!template) return false
  const parsed = parseCanonicalTemplate(template)
  return parsed.ok && parsed.value !== ''
}

function applyTemplate(template: string, editionSlug: string): string {
  return template.split(CANONICAL_TEMPLATE_SLOT).join(editionSlug)
}

/**
 * La URL canónica de una edición.
 *
 * Una plantilla guardada por otra vía y ya inválida cae al host propio en vez
 * de emitir una canónica rota: apuntar a un 404 es peor que no apuntar.
 */
export function editionCanonicalUrl(args: {
  tenantSlug: string
  editionSlug: string
  template: string | null
}): string {
  if (isExternalCanonical(args.template)) {
    return applyTemplate(args.template as string, args.editionSlug)
  }
  return hostedNewsletterUrl(args.tenantSlug, args.editionSlug)
}

/**
 * Mapa idioma → URL de las ediciones hermanas (mismo `translation_group_id`),
 * para `alternates.languages`.
 *
 * Con un solo idioma no se emite nada: declarar hreflang de una sola versión no
 * aporta señal y ensucia el head.
 */
export function editionAlternates(args: {
  tenantSlug: string
  template: string | null
  siblings: { slug: string; language: string }[]
}): Record<string, string> {
  if (args.siblings.length < 2) return {}
  const out: Record<string, string> = {}
  for (const s of args.siblings) {
    out[s.language] = editionCanonicalUrl({
      tenantSlug:  args.tenantSlug,
      editionSlug: s.slug,
      template:    args.template,
    })
  }
  return out
}
