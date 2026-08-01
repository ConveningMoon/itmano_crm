// Cortes fijos de la banda de CALIDAD.
//
// Sustituyen a los antiguos SCORE_BANDS (60/35/15), que espejaban el CASE de
// `recompute_lead_score` cuando el trigger asignaba `leads.status`. Desde la
// migración 082 el trigger ya no asigna estado, así que aquellos cortes no
// describían nada.
//
// Estos SÍ existen: son el camino de respaldo de `leads_list.quality_band`,
// el que se usa cuando el tenant tiene menos de 20 leads activos y los
// quintiles no significan nada todavía. Es decir, exactamente la situación de
// un cliente nuevo — que es cuando la pantalla de Ajustes → Scoring importa.
//
// Si cambian aquí, cambian en la vista. Son dos sitios y hay que tocar los dos.
export const QUALITY_CUTS = {
  alta:       80,
  media_alta: 60,
  media:      35,
  media_baja: 15,
} as const
