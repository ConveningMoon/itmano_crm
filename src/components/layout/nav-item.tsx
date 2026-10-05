'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { m } from 'motion/react'
import { LinkPendingSpinner } from '@/components/ui/loading-indicator'
import {
  LayoutDashboard,
  Users,
  Building2,
  FileDown,
  BarChart2,
  Settings,
  GitBranch,
  Mail,
  ShieldCheck,
  Bell,
  LifeBuoy,
  Inbox,
  Images,
  Sparkles,
  Newspaper,
} from 'lucide-react'

// Un ítem está activo si su href es el prefijo MÁS específico que coincide con la
// ruta actual: con la lista completa de hrefs un ítem anidado gana sobre el que
// lo contiene, y así el padre no se ilumina cuando estás en el hijo. Sin la
// lista, cae al comportamiento previo (exacto o startsWith).
function computeActive(pathname: string, href: string, hrefs?: string[]): boolean {
  const matchesHref = (h: string) => pathname === h || pathname.startsWith(`${h}/`)
  if (hrefs && hrefs.length > 0) {
    const matches = hrefs.filter(matchesHref)
    if (matches.length === 0) return false
    const best = matches.reduce((a, b) => (b.length > a.length ? b : a))
    return best === href
  }
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
}

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  LayoutDashboard,
  Users,
  Building2,
  FileDown,
  BarChart2,
  Settings,
  GitBranch,
  Mail,
  ShieldCheck,
  Bell,
  LifeBuoy,
  Inbox,
  Images,
  Sparkles,
  Newspaper,
}

interface NavItemProps {
  label: string
  href: string
  icon: string
  badge?: number
  // Etiqueta de texto ("Pronto") de una ruta visible pero cerrada. En muted, no
  // en dorado: anticipa algo, no reclama atención como un contador.
  badgeLabel?: string
  // Sidebar y MobileNav coexisten montados; cada lista necesita su propio
  // layoutId para que el indicador no salte entre ambas.
  indicatorId?: string
  // Todos los hrefs del nav — para resolver el activo por el prefijo MÁS largo.
  // Sin esto, un ítem padre quedaría activo también en las rutas de su hijo.
  hrefs?: string[]
}

export function NavItem({ label, href, icon, badge, badgeLabel, indicatorId = 'nav-indicator', hrefs }: NavItemProps) {
  const Icon = ICONS[icon]

  // Prefetch por defecto, al entrar en viewport.
  //
  // Antes de Cache Components iba por intención (hover/foco/toque): cada ruta
  // era dinámica y prefetchearla era un render completo en el servidor, ~21 por
  // carga de página. Ahora cada ruta tiene su shell prerenderizado y el
  // prefetch trae SÓLO eso (nav, cabecera y el skeleton del loading.tsx): sale
  // del build, sin tocar la base —medido con SUPABASE_TRACE: la carga de
  // /dashboard sigue en sus 9 consultas con las 9 rutas del nav prefetcheadas—.
  // A cambio, el clic pinta el skeleton de destino sin esperar a la red,
  // también en un toque de móvil, que antes llegaba sin nada precargado.
  //
  // El drawer móvil sólo monta sus ítems al abrirse, así que no duplica nada.
  return (
    <Link
      href={href}
      className="nav-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '6px',
        textDecoration: 'none',
        fontSize: '13px',
        borderLeft: '2px solid transparent',
        position: 'relative',
      }}
    >
      {/* Lo único que lee la ruta, en su propio <Suspense>: en el prerender de
          una ruta con parámetros (/leads/[id]) la ruta no se conoce y el hook
          suspende. Así el enlace sale en el shell estático y sólo la marca de
          activo espera; en las rutas sin parámetros sale ya marcada. */}
      <Suspense fallback={null}>
        <NavActiveMarker href={href} hrefs={hrefs} indicatorId={indicatorId} />
      </Suspense>
      {Icon && <Icon size={16} strokeWidth={1.6} />}
      <span style={{ flex: 1 }}>{label}</span>
      {/* Señal inmediata del clic para cuando el prefetch aún no llegó (red
          lenta, o un clic justo al cargar): hasta que responde el servidor no
          aparece el loading.tsx de la ruta. */}
      <LinkPendingSpinner />
      {badge !== undefined && (
        <span
          style={{
            fontSize: '11px',
            fontWeight: '500',
            color: 'var(--accent-gold)',
            backgroundColor: 'rgba(201,169,110,0.15)',
            padding: '1px 6px',
            borderRadius: '10px',
          }}
        >
          {badge}
        </span>
      )}
      {badgeLabel && (
        <span
          style={{
            fontSize: '10px',
            fontWeight: '500',
            letterSpacing: '0.04em',
            color: 'var(--text-muted)',
            backgroundColor: 'var(--bg-overlay)',
            padding: '1px 6px',
            borderRadius: '4px',
          }}
        >
          {badgeLabel}
        </span>
      )}
    </Link>
  )
}

/**
 * Barra dorada del ítem activo. Lleva `data-nav-active`, que es lo que pinta el
 * enlace como activo (`.nav-item:has([data-nav-active])` en globals.css).
 */
function NavActiveMarker({ href, hrefs, indicatorId }: { href: string; hrefs?: string[]; indicatorId: string }) {
  const pathname = usePathname()
  if (!computeActive(pathname, href, hrefs)) return null
  return (
    <m.span
      data-nav-active=""
      layoutId={indicatorId}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      style={{
        position: 'absolute',
        left: 0,
        top: '6px',
        bottom: '6px',
        width: '2px',
        borderRadius: '1px',
        backgroundColor: 'var(--accent-gold)',
      }}
    />
  )
}
