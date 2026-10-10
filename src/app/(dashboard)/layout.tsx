import { Suspense } from 'react'
import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { NavList } from '@/components/layout/nav-list'
import { MobileNavTriggerFallback } from '@/components/layout/mobile-nav'
import { NewLeadButton } from '@/components/layout/new-lead-button'
import { SpeedInsights } from '@/components/layout/speed-insights'
import { DbWarmer } from '@/components/layout/db-warmer'
import {
  AiLimitSlot, BrandFallback, BrandSlot, MobileNavSlot, NewLeadSlot, NewVersionNoticeSlot, SidebarNavSlot,
  SidebarUserFallback, SidebarUserSlot, SubscriptionBannerSlot, TenantSwitcherSlot,
  TopbarPillFallback, UnreadBadgeSlot,
} from '@/components/layout/shell-slots'

// El layout NO espera a nada. Con Cache Components su marco —sidebar, topbar y
// el <main> con el loading.tsx de la página— se prerenderiza en el build y sale
// del CDN en la primera respuesta, antes de que la función lea la cookie.
//
// Todo lo que depende de la sesión (ítems según el rol, usuario, drawer móvil,
// "Registrar Lead") o de la base (logo, plan, no leídas, límite de IA,
// switcher, banner) es un slot de shell-slots.tsx dentro de su <Suspense>, con
// un fallback del mismo tamaño. Cada slot lee el contexto por su cuenta
// (getCurrentTenantContext está en cache()) y los datos de getShellData, así
// que siguen siendo UNA lectura de contexto y UNA ola para el shell.
//
// No leas la sesión ni la base aquí arriba: un `await` en el cuerpo del layout
// saca del shell estático todo el dashboard, incluido el loading.tsx de cada
// página. Ver "Cache Components" en docs/agents/architecture.md.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const brand = (
    <Suspense fallback={<BrandFallback />}>
      <BrandSlot />
    </Suspense>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-base)' }}>
      <Sidebar
        brand={brand}
        nav={
          // El fallback es el nav de un tenant: lo que ven agent_owner y agent.
          <Suspense fallback={<NavList />}>
            <SidebarNavSlot />
          </Suspense>
        }
        user={
          <Suspense fallback={<SidebarUserFallback />}>
            <SidebarUserSlot />
          </Suspense>
        }
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
          mobileNav={
            <Suspense fallback={<MobileNavTriggerFallback />}>
              <MobileNavSlot />
            </Suspense>
          }
          aiLimitSlot={
            <Suspense fallback={<TopbarPillFallback />}>
              <AiLimitSlot />
            </Suspense>
          }
          // Sin fallback: sólo existe para el super_admin, y reservarle sitio
          // movería la barra de todos los demás al llegar la sesión.
          tenantSwitcherSlot={
            <Suspense fallback={null}>
              <TenantSwitcherSlot />
            </Suspense>
          }
          unreadBadgeSlot={
            <Suspense fallback={null}>
              <UnreadBadgeSlot />
            </Suspense>
          }
          newLeadSlot={
            <Suspense fallback={<NewLeadButton />}>
              <NewLeadSlot />
            </Suspense>
          }
        />
        {/* Sin fallback: el banner sólo existe en estados de suscripción
            excepcionales, y reservarle sitio siempre movería el contenido en
            el caso normal. */}
        <Suspense fallback={null}>
          <SubscriptionBannerSlot />
        </Suspense>
        <main className="app-shell-main max-md:overflow-x-hidden" style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
      {/* Deploy que renderiza esta pestaña. Sólo existe en Vercel: en local
          no hay deploys que comparar y el aviso no se monta. */}
      <Suspense fallback={null}>
        <NewVersionNoticeSlot />
      </Suspense>
      {/* Métricas reales de quien usa el CRM (Speed Insights). Sólo en
          producción: los previews y local no tienen el script y sus visitas
          gastarían la cuota gratuita de eventos. VERCEL_ENV se lee en el
          build, al prerenderizar el shell.

          En su propio <Suspense>: lee la ruta (usePathname/useParams), que en
          el prerender de una ruta con parámetros no se conoce. No pinta nada,
          así que el fallback es vacío y el script se inyecta al hidratar.
          Como sólo se monta en producción, ni local ni los previews detectan
          un fallo aquí: comprobarlo con `VERCEL_ENV=production npm run build`. */}
      {process.env.VERCEL_ENV === 'production' && (
        <Suspense fallback={null}>
          <SpeedInsights />
        </Suspense>
      )}
      {/* Latido que mantiene caliente la base mientras se usa el CRM (ver
          src/lib/warm.ts). Sólo en producción, como Speed Insights: en local y
          en los previews no aporta y sólo añadiría peticiones. No lee nada de
          la ruta ni de la sesión, así que forma parte del shell estático. */}
      {process.env.VERCEL_ENV === 'production' && <DbWarmer />}
    </div>
  )
}
