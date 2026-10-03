import 'server-only'

// Caché de las páginas públicas alojadas (/web, /nl, /hp) con Cache Components.
// Convenciones en docs/agents/architecture.md ("Cache Components").

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
