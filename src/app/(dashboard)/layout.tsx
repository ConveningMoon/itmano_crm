import { Suspense } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import {
  AiLimitSlot, BrandFallback, BrandSlot, PlanLabelFallback, PlanLabelSlot,
  SubscriptionBannerSlot, TenantSwitcherSlot, TopbarPillFallback, UnreadBadgeSlot,
} from '@/components/layout/shell-slots'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getCurrentTenantContext()

  // Modo hub: super_admin sin tenant seleccionado — el nav colapsa a
  // Centro de control + Notificaciones (el resto redirigiría al hub).
  const hubMode = ctx.role === 'super_admin' && !ctx.tenant_id

  // El shell sólo espera al contexto (rol, tenant, email). Todo lo demás que
  // lee de la base —logo, plan, contador de no leídas, límite de IA, switcher
  // de tenant y banner de suscripción— va dentro de un <Suspense> propio y
  // llega por streaming. Sigue siendo UNA ola de consultas (getShellData la
  // deduplica), pero ya no bloquea: el nav y el loading.tsx de la página se
  // pintan de inmediato, y en una carga dura el HTML del shell sale antes de
  // que la base responda.
  //
  // El email sale del claim del JWT que ya validó getCurrentTenantContext;
  // pedirlo otra vez al servidor de auth era un round-trip entero.
  const userEmail = ctx.email

  const brand = (
    <Suspense fallback={<BrandFallback />}>
      <BrandSlot ctx={ctx} hubMode={hubMode} />
    </Suspense>
  )
  const planLabel = ctx.tenant_id ? (
    <Suspense fallback={<PlanLabelFallback />}>
      <PlanLabelSlot ctx={ctx} />
    </Suspense>
  ) : null

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-base)' }}>
      <Sidebar
        role={ctx.role}
        userEmail={userEmail}
        hubMode={hubMode}
        brand={brand}
        planLabel={planLabel}
      />
      {/* Sidebar offset + content gutter come from the authoritative .app-shell-*
          rules in globals.css (a layered utility would lose to the unlayered
          `* { margin:0; padding:0 }` reset). ≥768px = 220px offset + 24px gutter
          (byte-identical to pre-responsive); <768px = no offset + 16px gutter. */}
      {/* min-w-0 va en TODOS los anchos: por defecto un flex item usa
          min-width:auto, así que el contenido ancho (el tablero kanban, la tabla
          de leads) empujaba la página entera en vez de scrollear dentro de su
          propio contenedor — y los botones Tabla/Kanban acababan fuera de
          pantalla. Estaba puesto sólo en móvil. */}
      <div
        className="app-shell-content min-w-0"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <Topbar
          role={ctx.role}
          userEmail={userEmail}
          hubMode={hubMode}
          brand={brand}
          planLabel={planLabel}
          aiLimitSlot={ctx.tenant_id ? (
            <Suspense fallback={<TopbarPillFallback />}>
              <AiLimitSlot ctx={ctx} />
            </Suspense>
          ) : null}
          tenantSwitcherSlot={ctx.role === 'super_admin' ? (
            <Suspense fallback={<TopbarPillFallback width="150px" />}>
              <TenantSwitcherSlot ctx={ctx} />
            </Suspense>
          ) : null}
          unreadBadgeSlot={
            <Suspense fallback={null}>
              <UnreadBadgeSlot ctx={ctx} />
            </Suspense>
          }
        />
        {/* Sin fallback: el banner sólo existe en estados de suscripción
            excepcionales, y reservarle sitio siempre movería el contenido en
            el caso normal. */}
        {ctx.tenant_id && (
          <Suspense fallback={null}>
            <SubscriptionBannerSlot ctx={ctx} />
          </Suspense>
        )}
        <main className="app-shell-main max-md:overflow-x-hidden" style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
