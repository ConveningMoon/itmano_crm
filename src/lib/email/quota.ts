// Cuotas de las cuentas de Resend. PURO: lo usan el wrapper de envío
// (src/lib/resend.ts), la guardia de los envíos masivos, el panel de operación
// y test:unit.
//
// Resend informa la cuota en cada respuesta:
//   · x-resend-daily-quota   → correos usados hoy (SÓLO plan Free).
//   · x-resend-monthly-quota → correos usados en el mes.
// y responde 429 `daily_quota_exceeded` / `monthly_quota_exceeded` al agotarla.
// Como respaldo cuando no llegan cabeceras (Pro no manda la diaria), el CRM
// cuenta cada envío real por cuenta (resend_usage_daily). Gana el mayor.

export type QuotaKind = 'daily' | 'monthly'

export interface QuotaHeaders {
  daily:   number | null
  monthly: number | null
}

function intHeader(headers: Record<string, string> | null | undefined, name: string): number | null {
  if (!headers) return null
  const raw = headers[name] ?? headers[name.toLowerCase()]
  if (raw === undefined || raw === null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null
}

export function parseQuotaHeaders(headers: Record<string, string> | null | undefined): QuotaHeaders {
  return {
    daily:   intHeader(headers, 'x-resend-daily-quota'),
    monthly: intHeader(headers, 'x-resend-monthly-quota'),
  }
}

/** 'daily' / 'monthly' si el error es un tope de cuota de Resend; null si es otra cosa. */
export function quotaErrorKind(err: { name?: string | null; message?: string | null } | null | undefined): QuotaKind | null {
  if (!err) return null
  const text = `${err.name ?? ''} ${err.message ?? ''}`
  if (/daily_quota_exceeded|daily (email )?(sending )?quota/i.test(text)) return 'daily'
  if (/monthly_quota_exceeded|monthly (email )?(sending )?quota/i.test(text)) return 'monthly'
  return null
}

/** Lo que devuelve la RPC resend_quota_status. */
export interface QuotaStatus {
  counted_today:  number
  counted_month:  number
  header_daily:   number | null
  header_monthly: number | null
  exhausted:      QuotaKind | null
  daily_quota:    number | null
  monthly_quota:  number | null
}

export interface QuotaRemaining {
  usedToday:  number
  usedMonth:  number
  /** null = sin cuota anotada en provider_settings: no se puede limitar. */
  daily:      number | null
  monthly:    number | null
  /** El menor de los dos, o null si ninguno se conoce. */
  remaining:  number | null
  /** Qué tope manda ahora (el que deja menos), si alguno se conoce. */
  binding:    QuotaKind | null
}

export function parseQuotaStatus(raw: unknown): QuotaStatus {
  const r = (raw ?? {}) as Record<string, unknown>
  const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null)
  const exhausted = r.exhausted === 'daily' || r.exhausted === 'monthly' ? r.exhausted : null
  return {
    counted_today:  num(r.counted_today) ?? 0,
    counted_month:  num(r.counted_month) ?? 0,
    header_daily:   num(r.header_daily),
    header_monthly: num(r.header_monthly),
    exhausted,
    daily_quota:    num(r.daily_quota),
    monthly_quota:  num(r.monthly_quota),
  }
}

export function quotaRemaining(s: QuotaStatus): QuotaRemaining {
  const usedToday = Math.max(s.counted_today, s.header_daily ?? 0)
  const usedMonth = Math.max(s.counted_month, s.header_monthly ?? 0)

  let daily = s.daily_quota === null ? null : Math.max(0, s.daily_quota - usedToday)
  let monthly = s.monthly_quota === null ? null : Math.max(0, s.monthly_quota - usedMonth)
  // Resend ya dijo que no: manda sobre lo que calcule el CRM.
  if (s.exhausted === 'daily') daily = 0
  if (s.exhausted === 'monthly') monthly = 0

  let remaining: number | null = null
  let binding: QuotaKind | null = null
  if (daily !== null) { remaining = daily; binding = 'daily' }
  if (monthly !== null && (remaining === null || monthly < remaining)) { remaining = monthly; binding = 'monthly' }
  return { usedToday, usedMonth, daily, monthly, remaining, binding }
}

/** Inicio del siguiente periodo de la cuota (UTC), cuando vuelve a haber envíos. */
export function nextQuotaWindow(kind: QuotaKind, now: Date): Date {
  return kind === 'daily'
    ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
}

/** Mensaje visible cuando un envío queda en espera por la cuota de la cuenta. */
export function quotaWaitMessage(kind: QuotaKind, opts: { sentNow?: number; pending?: number } = {}): string {
  const progress = opts.sentNow && opts.pending
    ? ` Salieron ${opts.sentNow}; quedan ${opts.pending} en espera.`
    : opts.pending ? ` Quedan ${opts.pending} en espera.` : ''
  return kind === 'daily'
    ? `Se alcanzó el tope diario de correos de la cuenta de envío.${progress} El envío sigue solo mañana (UTC), sin duplicar a nadie.`
    : `Se alcanzó el tope mensual de correos de la cuenta de envío.${progress} El envío sigue solo el mes próximo, o antes si se amplía el plan de correo.`
}

/** Mensaje para un envío individual (one-off) rechazado por la cuota. */
export function quotaRejectMessage(kind: QuotaKind): string {
  return kind === 'daily'
    ? 'No se envió: la cuenta de correo alcanzó su tope diario. Inténtalo mañana o pide a ITMANO ampliar el plan de correo.'
    : 'No se envió: la cuenta de correo alcanzó su tope mensual. Pide a ITMANO ampliar el plan de correo.'
}

/**
 * Cuántos de `wanted` pueden salir ahora sin pasar la cuota. null en
 * `remaining` (cuota no anotada) no limita: el 429 de Resend sigue siendo la
 * última barrera, y también deja el envío en espera.
 */
export function allowedNow(wanted: number, q: Pick<QuotaRemaining, 'remaining'>): number {
  if (q.remaining === null) return wanted
  return Math.max(0, Math.min(wanted, q.remaining))
}

export interface QuotaBudget {
  /** Cuántos de `wanted` caben todavía en esta pasada. */
  allowed(wanted: number): number
  /** Descuenta lo que salió. */
  spend(n: number): void
  /** El tope que manda, para el mensaje de espera. */
  readonly binding: QuotaKind
}

/**
 * Presupuesto de un envío masivo: se lee la cuota UNA vez al empezar y se
 * descuenta en memoria lote a lote. No depende de que el contador de la base
 * se actualice entre lotes (con envíos simulados fuera de producción no se
 * actualiza) ni gasta una lectura por lote.
 */
export function quotaBudget(q: QuotaRemaining): QuotaBudget {
  let left = q.remaining
  return {
    allowed: wanted => allowedNow(wanted, { remaining: left }),
    spend: n => { if (left !== null) left = Math.max(0, left - n) },
    binding: q.binding ?? 'daily',
  }
}
