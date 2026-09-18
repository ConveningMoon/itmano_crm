import 'server-only'
import { cache } from 'react'
import type { TenantContext } from '@/lib/auth/tenant-context'
import { getUnreadCount } from '@/lib/data/notifications'
import { getTenantsForSwitcher, getTenantBranding, type SwitcherTenant, type TenantBranding } from '@/lib/data/tenants'
import { getAiLimitIndicatorFor, type AiLimitIndicator } from '@/lib/services/ai-limit'
import { getSubscription } from '@/lib/data/subscriptions'
import { planBadgeLabel } from '@/lib/subscriptions'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import type { TenantAccess } from '@/lib/subscriptions/access'

export interface ShellData {
  unreadCount:     number
  switcherTenants: SwitcherTenant[] | null
  branding:        TenantBranding | null
  aiLimit:         AiLimitIndicator | null
  planLabel:       string | null
  access:          TenantAccess | null
}

/**
 * Todo lo que el shell del dashboard (sidebar, topbar, banner) lee de la base,
 * en UNA sola ola y deduplicado por request.
 *
 * Existe para que el layout no tenga que esperar estas lecturas antes de
 * pintar: cada pieza del shell las pide desde su propio <Suspense>, y como la
 * función está en cache() todas comparten la misma promesa. El nav y el
 * loading.tsx de la página salen en cuanto se conoce el contexto; los datos
 * del shell llegan por streaming, en paralelo con los de la página.
 *
 * La clave del cache es el objeto `ctx`: getCurrentTenantContext también está
 * en cache(), así que dentro de un request es siempre la misma referencia.
 */
export const getShellData = cache(async function getShellData(ctx: TenantContext): Promise<ShellData> {
  const [unreadCount, switcherTenants, branding, aiLimit, subscription, access] = await Promise.all([
    getUnreadCount(ctx.tenant_id, ctx.role === 'agent' ? ctx.agent_id : null),
    // Switcher del topbar: solo el super_admin carga la lista de tenants.
    ctx.role === 'super_admin' ? getTenantsForSwitcher() : null,
    // Branding del tenant activo (logo del sidebar). En modo hub no hay tenant —
    // el shell muestra el wordmark de ITMANO.
    ctx.tenant_id ? getTenantBranding(ctx.tenant_id) : null,
    // Indicador del límite mensual de IA (topbar) — solo con tenant activo. Para
    // un rol 'agent' en plan Partner el porcentaje es el de SU parte del límite.
    getAiLimitIndicatorFor(ctx),
    // Suscripción del tenant → label bajo el nombre del usuario en el sidebar.
    ctx.tenant_id ? getSubscription(ctx.tenant_id) : null,
    // Banner de estado de suscripción — solo con tenant activo. El super_admin
    // en modo hub (sin tenant_id) no tiene una fila de `subscriptions` que leer.
    ctx.tenant_id ? getTenantAccessFor(ctx.tenant_id) : null,
  ])

  return {
    unreadCount,
    switcherTenants,
    branding,
    aiLimit,
    planLabel: planBadgeLabel(subscription),
    access,
  }
})
