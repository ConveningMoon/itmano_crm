'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Suspense, useEffect, type ReactNode } from 'react'
import { Bell } from 'lucide-react'
import { pageTitleFor, DEFAULT_PAGE_TITLE as DEFAULT_TITLE } from '@/lib/routing/page-titles'

// Título de la página activa. Va aparte y en su propio <Suspense> porque lee
// la ruta: en el prerender de una ruta con parámetros (/leads/[id]) la ruta aún
// no se conoce y usePathname suspende; el título llega al hidratar.
function TopbarTitle() {
  const pathname = usePathname()
  return <>{pageTitleFor(pathname)}</>
}

// Marco de la barra superior. Sale en el shell prerenderizado del dashboard; lo
// que depende de la sesión o de la base (drawer móvil, límite de IA, switcher
// de tenant, contador de no leídas, "Registrar Lead") llega como ReactNode
// desde el layout, cada pieza dentro de su <Suspense> (ver shell-slots.tsx).
export function Topbar({
  mobileNav,
  aiLimitSlot,
  tenantSwitcherSlot,
  unreadBadgeSlot,
  newLeadSlot,
}: {
  // Drawer móvil (botón + panel); solo se ve en teléfonos.
  mobileNav: ReactNode
  // Límite mensual de IA del tenant activo (vacío en modo hub).
  aiLimitSlot: ReactNode
  // Solo pinta algo para super_admin — el switcher de tenant.
  tenantSwitcherSlot: ReactNode
  // Contador sobre la campana.
  unreadBadgeSlot: ReactNode
  // "Registrar Lead" — vacío en modo hub.
  newLeadSlot: ReactNode
}) {
  const router = useRouter()
  // La campana navega con router.push: sin esto nada precarga /notifications.
  // Es el shell estático de la ruta, sin consultas (ver NewLeadButton).
  useEffect(() => { router.prefetch('/notifications') }, [router])

  return (
    <header
      className="app-shell-topbar"
      style={{
        height: '56px',
        backgroundColor: 'var(--bg-base)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        {/* Drawer trigger — phones only (md:hidden inside MobileNav). */}
        {mobileNav}
        <h1
          style={{
            fontSize: '15px',
            fontWeight: '500',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          <Suspense fallback={DEFAULT_TITLE}>
            <TopbarTitle />
          </Suspense>
        </h1>
      </div>

      <div className="topbar-actions">
        {/* Uso de IA del mes — visible dentro del CRM de un tenant */}
        {aiLimitSlot}

        {/* Switcher de tenant — solo super_admin */}
        {tenantSwitcherSlot}

        {/* Notification bell */}
        <button
          type="button"
          aria-label="Notificaciones"
          onClick={() => router.push('/notifications')}
          className="topbar-btn topbar-btn-square"
        >
          <Bell size={16} strokeWidth={2} aria-hidden="true" />
          {unreadBadgeSlot}
        </button>

        {/* Registrar Lead — oculto en modo hub (sin tenant seleccionado no hay
            destino para el lead; /leads/new redirigiría al centro de control). */}
        {newLeadSlot}
      </div>
    </header>
  )
}
