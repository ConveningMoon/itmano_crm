// Conversión de una fuente: envíos / vistas, en porcentaje. `null` significa
// que la fuente no tiene vistas en la ventana (ver ChannelMetrics en
// lib/data/channels.ts): mostrar "0%" afirmaría que nadie convirtió, y
// interpolar el null pintaba "null%". Sin vistas, la cifra no existe: "—".
export function formatConversion(rate: number | null): string {
  return rate === null ? '—' : `${rate}%`
}
