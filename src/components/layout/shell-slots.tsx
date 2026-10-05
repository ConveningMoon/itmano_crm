import { Suspense } from 'react'
import { connection } from 'next/server'
import { getCurrentTenantContext, type TenantContext } from '@/lib/auth/tenant-context'
import { getShellData } from '@/lib/data/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { BrandLogo } from './brand-logo'
import { AiLimitBadge } from './ai-limit-badge'
import { UnreadBadge } from './unread-badge'
import { TenantSwitcher } from './tenant-switcher'
import { MobileNav } from './mobile-nav'
import { NavList } from './nav-list'
import { NewLeadButton } from './new-lead-button'
import { SidebarUser } from './sidebar-user'
import { navItemsForRole } from './nav-items'
import { SubscriptionBanner } from '@/components/dashboard/subscription-banner'
import { NewVersionNotice } from './new-version-notice'

// Las piezas del shell que dependen de la sesión o de la base, cada una como
// Server Component async para montarla dentro de su propio <Suspense>.
//
// Con Cache Components el layout de (dashboard) no espera a nada: su marco
// (sidebar, topbar, <main> con el loading.tsx de la página) se prerenderiza y
// sale del CDN. Cada slot lee el contexto por su cuenta —está en cache(), así
// que es UNA lectura por request— y las lecturas de la base salen de
// getShellData, también en cache(): entre todas siguen costando UNA ola.
//
// Cada fallback ocupa exactamente el sitio de la pieza real (misma altura y
// un ancho parecido) para que al llegar el dato nada salte.

/** Super_admin sin tenant seleccionado: el shell colapsa al centro de control. */
function isHubMode(ctx: TenantContext) {
  return ctx.role === 'super_admin' && !ctx.tenant_id
}

/** Logo del tenant (o wordmark de ITMANO en modo hub) en el sidebar y el drawer. */
export async function BrandSlot() {
  const ctx = await getCurrentTenantContext()
  const { branding } = await getShellData(ctx)
  return <BrandLogo logoUrl={branding?.logoUrl ?? null} tenantName={branding?.name ?? null} hubMode={isHubMode(ctx)} />
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

/**
 * Ítems del nav del sidebar según el rol. El fallback es el nav de un tenant
 * (`NavList` sin rol), que es exactamente lo que ven agent_owner y agent: para
 * ellos no cambia nada al llegar la sesión. Sólo el super_admin lo ve cambiar.
 */
export async function SidebarNavSlot() {
  const ctx = await getCurrentTenantContext()
  return <NavList items={navItemsForRole(ctx.role, { hubMode: isHubMode(ctx) })} />
}

/** Usuario, rol y plan al pie del sidebar. */
export async function SidebarUserSlot() {
  const ctx = await getCurrentTenantContext()
  return (
    <SidebarUser
      email={ctx.email}
      role={ctx.role}
      planLabel={ctx.tenant_id ? (
        <Suspense fallback={<PlanLabelFallback />}>
          <PlanLabelSlot />
        </Suspense>
      ) : null}
    />
  )
}

/** Misma caja que SidebarUser con plan: avatar de 32px y tres líneas. */
export function SidebarUserFallback() {
  return (
    <div style={{ padding: '12px 16px 8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
      <Skeleton w="32px" h={32} r={16} style={{ flexShrink: 0 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <Skeleton w="130px" h={12} r={3} />
        <Skeleton w="70px" h={10} r={3} />
        <PlanLabelFallback />
      </div>
    </div>
  )
}

/** Nombre del plan bajo el usuario en el sidebar; nada si no hay suscripción. */
async function PlanLabelSlot() {
  const ctx = await getCurrentTenantContext()
  const { planLabel } = await getShellData(ctx)
  if (!planLabel) return null
  return (
    <div style={{ fontSize: '10px', color: 'var(--accent-gold)', letterSpacing: '0.04em', marginTop: '2px' }}>
      {planLabel}
    </div>
  )
}

/** Misma altura que la línea del plan (10px de texto + 2px de margen). */
function PlanLabelFallback() {
  return <Skeleton w="72px" h={10} r={3} style={{ marginTop: '2px' }} />
}

/**
 * Drawer móvil (botón + panel). Necesita el rol para el nav y el usuario para
 * el pie, así que va entero detrás de la sesión; mientras tanto se pinta su
 * botón inerte en el mismo sitio.
 */
export async function MobileNavSlot() {
  const ctx = await getCurrentTenantContext()
  const hubMode = isHubMode(ctx)
  return (
    <MobileNav
      role={ctx.role}
      userEmail={ctx.email}
      hubMode={hubMode}
      brand={
        <Suspense fallback={<BrandFallback />}>
          <BrandSlot />
        </Suspense>
      }
      planLabel={ctx.tenant_id ? (
        <Suspense fallback={<PlanLabelFallback />}>
          <PlanLabelSlot />
        </Suspense>
      ) : null}
    />
  )
}

/** "Registrar Lead", salvo en modo hub: sin tenant no hay dónde guardar el lead. */
export async function NewLeadSlot() {
  const ctx = await getCurrentTenantContext()
  return isHubMode(ctx) ? null : <NewLeadButton />
}

/** Contador de no leídas sobre la campana. Sin fallback: es absoluto, no ocupa sitio. */
export async function UnreadBadgeSlot() {
  const ctx = await getCurrentTenantContext()
  const { unreadCount } = await getShellData(ctx)
  return <UnreadBadge count={unreadCount} />
}

/** Indicador del límite de IA (topbar); nada en modo hub. */
export async function AiLimitSlot() {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id) return null
  const { aiLimit } = await getShellData(ctx)
  if (!aiLimit) return null
  return <AiLimitBadge status={aiLimit} />
}

/** Misma caja que AiLimitBadge: 34px de alto, ~96px de ancho en escritorio. */
export function TopbarPillFallback({ width = '96px' }: { width?: string }) {
  return <Skeleton w={width} h={34} r={8} style={{ flexShrink: 0 }} />
}

/** Switcher de tenant (topbar); sólo super_admin. */
export async function TenantSwitcherSlot() {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') return null
  const { switcherTenants } = await getShellData(ctx)
  if (!switcherTenants) return null
  return <TenantSwitcher tenants={switcherTenants} activeTenantId={ctx.acting_as_tenant ? ctx.tenant_id : null} />
}

/**
 * Aviso de versión nueva (sólo en Vercel). El deploy se lee en el request y no
 * en el shell prerenderizado: el aviso compara con /api/version, que lo lee en
 * runtime, y lo que vale en el build no tiene por qué existir. No toca la base
 * ni pinta nada hasta que hay versión nueva, así que el fallback es vacío.
 */
export async function NewVersionNoticeSlot() {
  await connection()
  const version = process.env.VERCEL_DEPLOYMENT_ID
  return version ? <NewVersionNotice version={version} /> : null
}

/** Banner de estado de suscripción sobre el contenido. */
export async function SubscriptionBannerSlot() {
  const ctx = await getCurrentTenantContext()
  if (!ctx.tenant_id) return null
  const { access } = await getShellData(ctx)
  return <SubscriptionBanner banner={access?.banner ?? null} />
}
