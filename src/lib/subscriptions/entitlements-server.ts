import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSubscriptionRead } from '@/lib/data/subscriptions'
import { countMonthlyCorporateSends, windowTrialEnd } from '@/lib/subscriptions/quota'
import {
  failOpenEntitlements,
  getEntitlements,
  type Entitlement,
  type EntitlementKey,
  type TenantUsage,
} from '@/lib/subscriptions/entitlements'

// Capa de servidor de los derechos por plan: lee el uso real del tenant y deja
// que `getEntitlements` (pura) decida. Server Actions y servicios llaman a
// `assertEntitlement` en vez de comparar topes por su cuenta.
//
// Intake (api/intake/*) y webhooks NO deben llamar a este módulo: nunca se
// rechaza un lead que ya llegó.

/**
 * Conteos del tenant en paralelo. `head: true` evita traer filas; todos llevan
 * `tenant_id` (la service role se salta RLS, así que el filtro es la única
 * barrera). Memoizado por request: shell, página y acción comparten la lectura.
 */
export const getTenantUsage = cache(async function getTenantUsage(
  tenantId: string,
): Promise<TenantUsage> {
  const supabase = createAdminClient()
  // El conteo de correos depende de la suscripción (degradedAt/trialEndsAt):
  // se encadena a su promesa para correr en el mismo Promise.all que los demás
  // conteos, sin un salto serial extra.
  const sub = getSubscriptionRead(tenantId).then((r) => r.subscription)
  const [leads, agents, properties, emailsMonth] = await Promise.all([
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    supabase.from('agents').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('active', true),
    supabase.from('properties').select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('published_to_web', true),
    sub.then((s) => countMonthlyCorporateSends(tenantId, s?.degradedAt ?? null, windowTrialEnd(s))),
  ])
  // Un conteo fallido se lee como 0 (falla en abierto) pero deja rastro: es la
  // única señal de que el enforcement de ese límite quedó desactivado.
  for (const [name, res] of [['leads', leads], ['agents', agents], ['properties', properties]] as const) {
    if (res.error) {
      console.error(JSON.stringify({
        service: 'tenant-usage', tenant_id: tenantId, count: name,
        error: res.error.message, fallback: 'zero',
      }))
    }
  }
  return {
    leads: leads.count ?? 0,
    agents: agents.count ?? 0,
    publishedProperties: properties.count ?? 0,
    emailsMonth,
  }
})

async function compute(
  tenantId: string,
  opts?: { isSuperAdmin?: boolean; extraRows?: number },
): Promise<Record<EntitlementKey, Entitlement>> {
  const [read, usage] = await Promise.all([getSubscriptionRead(tenantId), getTenantUsage(tenantId)])
  // Lectura fallida: falla en abierto (getSubscriptionRead ya la registró). No
  // se asume "Esencial activo": bloquearía a un tenant de pago por un error.
  if (read.failed) return failOpenEntitlements()
  const subscription = read.subscription
  return getEntitlements({
    // Sin fila de suscripción: Esencial activo, igual que ai-limit y platform-ops.
    plan: subscription?.plan ?? 'esencial',
    status: subscription?.status ?? 'active',
    billingExempt: subscription?.billingExempt ?? false,
    trialEndsAt: subscription?.trialEndsAt ?? null,
    overCapSince: subscription?.overCapSince ?? null,
    usage,
    isSuperAdmin: opts?.isSuperAdmin,
    extraRows: opts?.extraRows,
  })
}

/** Derechos del tenant sin opciones; memoizado por request. */
export const getTenantEntitlements = cache(async function getTenantEntitlements(
  tenantId: string,
): Promise<Record<EntitlementKey, Entitlement>> {
  return compute(tenantId)
})

/**
 * Gate para Server Actions y servicios. Devuelve null si la operación procede,
 * o `{ ok: false, error }` listo para retornar (mismo patrón que
 * assertAiWithinLimit). Con `isSuperAdmin` o `extraRows` recalcula sobre el uso
 * ya cacheado en lugar de volver a contar.
 */
export async function assertEntitlement(
  tenantId: string,
  key: EntitlementKey,
  opts?: { isSuperAdmin?: boolean; extraRows?: number },
): Promise<{ ok: false; error: string } | null> {
  const all = opts?.isSuperAdmin || opts?.extraRows
    ? await compute(tenantId, opts)
    : await getTenantEntitlements(tenantId)
  const entitlement = all[key]
  if (entitlement.allowed) return null
  return { ok: false, error: entitlement.message ?? 'Tu plan no permite esta operación.' }
}
