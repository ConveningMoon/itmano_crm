// Modelo de los correos grupales. PURO: lo comparten las Server Actions, el
// despachador y la UI, y se prueba sin base de datos.

export const BROADCAST_STATUSES = ['draft', 'pending', 'sending', 'paused', 'sent', 'cancelled', 'failed'] as const
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number]

export const BROADCAST_STATUS_LABEL: Record<BroadcastStatus, string> = {
  draft:     'Borrador',
  pending:   'Programado',
  sending:   'Enviando',
  paused:    'Pausado',
  sent:      'Enviado',
  cancelled: 'Cancelado',
  failed:    'No salió',
}

// Los idiomas de un lead, igual que los open houses.
export const BROADCAST_LANGUAGES = ['es', 'en', 'pt'] as const
export type BroadcastLanguage = (typeof BROADCAST_LANGUAGES)[number]

/** Tope por envío: evita que un filtro mal puesto escriba a toda la base. */
export const MAX_BROADCAST_RECIPIENTS = 2000

/** Cuánto hacia el futuro se puede programar. */
export const MAX_SCHEDULE_DAYS = 90

export function canCancelBroadcast(status: BroadcastStatus): boolean {
  return status === 'pending' || status === 'sending' || status === 'paused'
}

export function canResumeBroadcast(status: BroadcastStatus): boolean {
  return status === 'paused' || status === 'failed'
}

// ── Guarda de reputación ─────────────────────────────────────────────────────
// Una lista vieja o importada puede quemar el dominio del tenant en un solo
// envío. Los rebotes llegan por webhook mientras el envío avanza, así que se
// evalúa antes de cada lote. Por debajo de la muestra mínima un rebote aislado
// no dice nada de la lista; una queja de spam, en cambio, siempre se revisa.

export const BOUNCE_GUARD_MIN_LEADS = 20
export const BOUNCE_GUARD_MAX_RATE  = 0.05

export interface BroadcastHealth {
  leads:      number
  bounced:    number
  complained: number
}

/** Motivo para pausar el envío, o null si puede seguir. */
export function broadcastGuardReason(h: BroadcastHealth): string | null {
  if (h.complained > 0) {
    return `Pausado: ${h.complained === 1 ? 'un destinatario marcó' : `${h.complained} destinatarios marcaron`} el correo como spam. Revisa el contenido y la lista antes de reanudar.`
  }
  if (h.leads >= BOUNCE_GUARD_MIN_LEADS && h.bounced / h.leads > BOUNCE_GUARD_MAX_RATE) {
    return `Pausado: rebotaron ${h.bounced} de ${h.leads} correos (más del ${BOUNCE_GUARD_MAX_RATE * 100}%). La lista parece desactualizada y seguir dañaría la reputación de tu dominio.`
  }
  return null
}

// ── Cuota ────────────────────────────────────────────────────────────────────

/**
 * Un envío grupal se comprueba ENTERO contra el cupo antes de empezar: cortarlo
 * a la mitad dejaría a parte de la lista sin el correo y sin forma de saberlo.
 */
export function broadcastQuotaError(allowance: { limit: number; used: number }, toSend: number): string | null {
  const left = Math.max(0, allowance.limit - allowance.used)
  if (toSend <= left) return null
  return `Este envío son ${toSend} correos y a tu equipo le quedan ${left} de ${allowance.limit} este mes. Reduce la audiencia o amplía tu plan.`
}
