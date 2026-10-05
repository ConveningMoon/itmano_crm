import 'server-only'

// Caché de las páginas públicas alojadas (/web, /nl, /hp) con Cache Components.
// Convenciones en docs/agents/architecture.md ("Cache Components").

/**
 * Etiquetas de caché de las páginas alojadas. Cada página cacheada se etiqueta
 * en su `use cache` en cuanto conoce el id (no el slug: así un cambio de slug
 * también invalida la URL vieja), y las acciones que cambian lo que muestra la
 * expiran con `updateTag` (server actions) o `revalidateTag(tag, 'max')`
 * (crons y webhooks, donde updateTag no existe).
 *
 * Llevan ids, nunca datos personales: Next guarda claves y tags en claro.
 */
export const hostedTag = {
  /** Catálogo /web/<tenant> y todas sus fichas de propiedad. */
  web: (tenantId: string) => `hosted:web:${tenantId}`,
  /** Portada /nl/<tenant> y todas sus ediciones. */
  nl: (tenantId: string) => `hosted:nl:${tenantId}`,
  /**
   * Todas las páginas /hp/<tenant>/<canal> de un tenant. Va por el slug del
   * tenant y no por ids porque también tiene que expirar el 404 de un canal
   * cuya página aún no estaba publicada, o que estaba inactivo: ahí no hay
   * canal que etiquetar. Un tenant tiene pocas, así que expirarlas juntas al
   * guardar cualquier canal es barato.
   */
  hp: (tenantSlug: string) => `hosted:hp:${tenantSlug}`,
}

/**
 * Slug que ningún tenant, propiedad, canal ni edición puede tener (los slugs
 * reales son `[a-z0-9-]`). Sólo existe para `generateStaticParams`.
 */
const SLUG_INEXISTENTE = '__sin-datos__'

/**
 * Con Cache Components `generateStaticParams` no puede devolver `[]` (error
 * `empty-generate-static-params`): Next necesita prerenderizar la ruta al
 * menos una vez para validar su shell. Cuando no hay filas —sandbox vacío, o
 * la base no respondió en el build— se prerenderiza un slug inexistente, que
 * resuelve a 404; las URLs reales se sirven bajo demanda como antes. Así un
 * build sigue sin caerse porque la base no conteste.
 */
export function alMenosUnParametro<K extends string>(
  params: Record<K, string>[],
  claves: readonly K[],
): Record<K, string>[] {
  if (params.length > 0) return params
  return [Object.fromEntries(claves.map(k => [k, SLUG_INEXISTENTE])) as Record<K, string>]
}
