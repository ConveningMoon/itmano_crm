import type { TenantContext } from '@/lib/auth/tenant-context'
import { getShellData } from '@/lib/data/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { BrandLogo } from './brand-logo'
import { AiLimitBadge } from './ai-limit-badge'
import { UnreadBadge } from './unread-badge'
import { TenantSwitcher } from './tenant-switcher'
import { SubscriptionBanner } from '@/components/dashboard/subscription-banner'

// Las piezas del shell que dependen de la base, cada una como Server Component
// async para montarla dentro de su propio <Suspense>. Todas leen de
// getShellData (cache()), así que entre todas cuestan UNA ola de consultas,
// la misma que antes; lo que cambia es que el layout ya no espera esa ola
// para pintar el nav, y el loading.tsx de la página aparece de inmediato.
//
// Cada fallback ocupa exactamente el sitio de la pieza real (misma altura y
// un ancho parecido) para que al llegar el dato nada salte.

/** Logo del tenant (o wordmark de ITMANO en modo hub) en el sidebar y el drawer. */
export async function BrandSlot({ ctx, hubMode }: { ctx: TenantContext; hubMode: boolean }) {
  const { branding } = await getShellData(ctx)
  return <BrandLogo logoUrl={branding?.logoUrl ?? null} tenantName={branding?.name ?? null} hubMode={hubMode} />
}

/** Misma caja que BrandLogo (44px de alto + 8px de margen). */
export function BrandFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', minHeight: '44px' }}>
      <Skeleton w="34px" h={34} r={8} />
      <Skeleton w="90px" h={12} r={3} />
    </div>
  )
}

/** Nombre del plan bajo el usuario en el sidebar; nada si no hay suscripción. */
export async function PlanLabelSlot({ ctx }: { ctx: TenantContext }) {
  const { planLabel } = await getShellData(ctx)
  if (!planLabel) return null
  return (
    <div style={{ fontSize: '10px', color: 'var(--accent-gold)', letterSpacing: '0.04em', marginTop: '2px' }}>
      {planLabel}
    </div>
  )
}

/** Misma altura que la línea del plan (10px de texto + 2px de margen). */
export function PlanLabelFallback() {
  return <Skeleton w="72px" h={10} r={3} style={{ marginTop: '2px' }} />
}

/** Contador de no leídas sobre la campana. Sin fallback: es absoluto, no ocupa sitio. */
export async function UnreadBadgeSlot({ ctx }: { ctx: TenantContext }) {
  const { unreadCount } = await getShellData(ctx)
  return <UnreadBadge count={unreadCount} />
}

/** Indicador del límite de IA (topbar); nada en modo hub. */
export async function AiLimitSlot({ ctx }: { ctx: TenantContext }) {
  const { aiLimit } = await getShellData(ctx)
  if (!aiLimit) return null
  return <AiLimitBadge status={aiLimit} />
}

/** Misma caja que AiLimitBadge: 34px de alto, ~96px de ancho en escritorio. */
export function TopbarPillFallback({ width = '96px' }: { width?: string }) {
  return <Skeleton w={width} h={34} r={8} style={{ flexShrink: 0 }} />
}

/** Switcher de tenant (topbar); sólo super_admin. */
export async function TenantSwitcherSlot({ ctx }: { ctx: TenantContext }) {
  const { switcherTenants } = await getShellData(ctx)
  if (!switcherTenants) return null
  return <TenantSwitcher tenants={switcherTenants} activeTenantId={ctx.acting_as_tenant ? ctx.tenant_id : null} />
}

/** Banner de estado de suscripción sobre el contenido. */
export async function SubscriptionBannerSlot({ ctx }: { ctx: TenantContext }) {
  const { access } = await getShellData(ctx)
  return <SubscriptionBanner banner={access?.banner ?? null} />
}
