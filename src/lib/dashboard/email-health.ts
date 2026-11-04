// Estado de salud de una tasa de email. Los umbrales de rebote y bajas son los de
// la tabla de secuencias de /emails (5% y 3%): hasta ese valor es sano, por encima
// alerta. Clics y respuestas nunca alertan: una tasa baja no es una falla, así que
// sólo se afirma "sano" cuando llegan al mínimo y, si no, no se dice nada.
export type EmailHealthKind = 'click' | 'reply' | 'bounce' | 'unsub'
export type EmailHealth = 'ok' | 'alert' | null

export const BOUNCE_ALERT_OVER = 5
export const UNSUB_ALERT_OVER = 3
export const CLICK_OK_FROM = 5
export const REPLY_OK_FROM = 3

export function emailHealth(kind: EmailHealthKind, rate: number, sends: number): EmailHealth {
  if (sends <= 0) return null
  switch (kind) {
    case 'bounce': return rate > BOUNCE_ALERT_OVER ? 'alert' : 'ok'
    case 'unsub': return rate > UNSUB_ALERT_OVER ? 'alert' : 'ok'
    case 'click': return rate >= CLICK_OK_FROM ? 'ok' : null
    case 'reply': return rate >= REPLY_OK_FROM ? 'ok' : null
  }
}
