import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { SubscriptionBanner } from '@/components/dashboard/subscription-banner'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getUnreadCount } from '@/lib/data/notifications'
import { getTenantsForSwitcher, getTenantBranding } from '@/lib/data/tenants'
import { getAiLimitIndicatorFor } from '@/lib/services/ai-limit'
import { getSubscription } from '@/lib/data/subscriptions'
import { planBadgeLabel } from '@/lib/subscriptions'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getCurrentTenantContext()

  // Modo hub: super_admin sin tenant seleccionado — el nav colapsa a
  // Centro de control + Notificaciones (el resto redirigiría al hub).
  const hubMode = ctx.role === 'super_admin' && !ctx.tenant_id

  // TODO lo que el shell necesita sale de UNA sola ola de queries. Antes iba
  // encadenado con await y cada pieza esperaba a la anterior: sobre una base de
  // datos remota eso son ~8 idas y vueltas en serie que el usuario paga enteras
  // en cada carga dura. Ninguna depende del resultado de otra, así que la única
  // razón para serializarlas era la forma del código.
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
    // en modo hub (sin tenant_id) no tiene una fila de `subscriptions` que leer;
    // pedir el acceso con un tenant nulo rompería el panel de administración.
    ctx.tenant_id ? getTenantAccessFor(ctx.tenant_id) : null,
  ])

  const planLabel = planBadgeLabel(subscription)
  // El email sale del claim del JWT que ya validó getCurrentTenantContext; pedirlo
  // otra vez al servidor de auth era un round-trip entero por el pie del sidebar.
  const userEmail = ctx.email

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-base)' }}>
      <Sidebar
        role={ctx.role}
        userEmail={userEmail}
        hubMode={hubMode}
        logoUrl={branding?.logoUrl ?? null}
        tenantName={branding?.name ?? null}
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
          unreadCount={unreadCount}
          userEmail={userEmail}
          hubMode={hubMode}
          tenants={switcherTenants ?? undefined}
          activeTenantId={ctx.acting_as_tenant ? ctx.tenant_id : null}
          logoUrl={branding?.logoUrl ?? null}
          tenantName={branding?.name ?? null}
          aiLimit={aiLimit}
          planLabel={planLabel}
        />
        <SubscriptionBanner banner={access?.banner ?? null} />
        <main className="app-shell-main max-md:overflow-x-hidden" style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
