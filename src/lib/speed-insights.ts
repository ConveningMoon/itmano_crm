// Ruta "con patrón" que Speed Insights agrupa: `/leads/3f2c…` → `/leads/[id]`.
// Sin esto cada lead, propiedad o fuente sería una ruta distinta en el panel y
// los números no se podrían comparar.
//
// Misma regla que `computeRoute` de @vercel/speed-insights: cada valor de
// parámetro que aparezca como segmento completo se sustituye por su nombre;
// los catch-all (arrays) se resuelven después y como bloque.
export function rutaConPatron(
  pathname: string | null,
  params: Record<string, string | string[] | undefined> | null,
): string | null {
  if (!pathname || !params) return pathname

  const segmento = (valor: string) =>
    new RegExp(`/${valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=[/?#]|$)`)

  let ruta = pathname
  const entradas = Object.entries(params)
  for (const [clave, valor] of entradas) {
    if (typeof valor === 'string' && valor) ruta = ruta.replace(segmento(valor), `/[${clave}]`)
  }
  for (const [clave, valor] of entradas) {
    if (Array.isArray(valor) && valor.length) ruta = ruta.replace(segmento(valor.join('/')), `/[...${clave}]`)
  }
  return ruta
}
