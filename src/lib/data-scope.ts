// Recorta un mapa por id a los ids visibles para quien consulta. Las páginas
// traen métricas de todo el tenant en una sola lectura; antes de serializarlas
// al cliente se filtran por lo que el rol realmente ve.
export function pickByIds<T>(record: Record<string, T>, ids: string[]): Record<string, T> {
  const out: Record<string, T> = {}
  for (const id of ids) {
    if (Object.prototype.hasOwnProperty.call(record, id)) out[id] = record[id]
  }
  return out
}
