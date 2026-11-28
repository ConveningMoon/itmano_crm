import { PLANS } from '@/lib/plans'
import { GRACE_DAYS } from '@/lib/subscriptions/access'
import type { SubscriptionPlan } from '@/lib/subscriptions'

// Propiedades publicadas por encima del tope del plan (bajada de plan, o un
// Esencial que ya tenía publicadas al desplegar). Lógica pura: el cron decide
// con `selectOverCapAction` y la reactivación usa `planPublishCap`.

/** Tope de propiedades publicadas del plan. null = ilimitado; Esencial = 0. */
export function planPublishCap(plan: SubscriptionPlan): number | null {
  const web = PLANS[plan].limits.webProperties
  if (web === 'unlimited') return null
  return web ?? 0
}

export type OverCapAction = 'mark' | 'clear' | 'wait' | 'unpublish' | 'none'

/**
 * Qué hacer con un tenant según sus publicadas y desde cuándo está sobre el
 * tope: fijar `over_cap_since` ('mark'), limpiarlo ('clear'), esperar la gracia
 * ('wait'), despublicar las sobrantes ('unpublish') o nada ('none').
 */
export function selectOverCapAction(input: {
  published: number
  cap: number | null
  overCapSince: string | Date | null
  now: Date
}): OverCapAction {
  const { published, cap, overCapSince, now } = input
  if (cap === null) return overCapSince ? 'clear' : 'none'
  if (published <= cap) return overCapSince ? 'clear' : 'none'
  if (!overCapSince) return 'mark'
  const since = new Date(overCapSince).getTime()
  const deadline = since + GRACE_DAYS.properties * 86_400_000
  return now.getTime() >= deadline ? 'unpublish' : 'wait'
}

/** Fecha (ISO) en que el cron despublicará las sobrantes: marca + gracia. */
export function overCapUnpublishOn(overCapSince: string | Date | null): string | null {
  if (!overCapSince) return null
  const since = new Date(overCapSince).getTime()
  if (Number.isNaN(since)) return null
  return new Date(since + GRACE_DAYS.properties * 86_400_000).toISOString()
}

/** DD/MM en UTC (el cron corre en UTC; evita que la zona del servidor cambie el día). */
function formatDayMonth(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Aviso al cliente de que se despublicarán propiedades. Mismo texto en
 * /properties, "Tu plan" y la notificación del cron. Se conservan las más
 * recientes: las despublicadas son las más antiguas.
 */
export function overCapNoticeText(input: { unpublishOn: string; excess: number; cap: number }): string {
  const { unpublishOn, excess, cap } = input
  const day = formatDayMonth(unpublishOn)
  const what = excess === 1
    ? 'se despublicará la propiedad más antigua que supera'
    : `se despublicarán las ${excess.toLocaleString('es-MX')} propiedades más antiguas que superan`
  return `El ${day} ${what} tu plan (tope ${cap.toLocaleString('es-MX')}). Cambia de plan para conservarlas.`
}

/** Aviso a partir de un derecho de publicación; null si no hay despublicación programada. */
export function overCapNoticeFor(e: { unpublishOn?: string | null; limit: number | null; used: number | null }): string | null {
  if (!e.unpublishOn || e.limit === null || e.used === null || e.used <= e.limit) return null
  return overCapNoticeText({ unpublishOn: e.unpublishOn, excess: e.used - e.limit, cap: e.limit })
}
