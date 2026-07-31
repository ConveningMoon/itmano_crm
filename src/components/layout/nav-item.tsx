'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { m } from 'motion/react'
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
} from 'lucide-react'

// Un ítem está activo si su href es el prefijo MÁS específico que coincide con la
// ruta actual. Con la lista completa de hrefs, /admin/carousels gana sobre /admin
// (y así "Centro de control" no se ilumina cuando estás en Carruseles). Sin la
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
}

interface NavItemProps {
  label: string
  href: string
  icon: string
  badge?: number
  // Sidebar y MobileNav coexisten montados; cada lista necesita su propio
  // layoutId para que el indicador no salte entre ambas.
  indicatorId?: string
  // Todos los hrefs del nav — para resolver el activo por el prefijo MÁS largo.
  // Sin esto, /admin quedaría activo también en /admin/carousels (startsWith).
  hrefs?: string[]
}

export function NavItem({ label, href, icon, badge, indicatorId = 'nav-indicator', hrefs }: NavItemProps) {
  const pathname = usePathname()
  const isActive = computeActive(pathname, href, hrefs)
  const Icon = ICONS[icon]

  // Prefetch POR INTENCIÓN, no al entrar en viewport.
  //
  // Con el prefetch por defecto, cada carga de página disparaba ~21 renders
  // dinámicos en el servidor: el nav tiene ~14 rutas y Sidebar y MobileNav están
  // MONTADOS a la vez (uno lo esconde CSS, pero sus Link siguen prefetcheando),
  // así que cada ruta se pedía dos veces. Todas son dinámicas —leen cookies para
  // el contexto de tenant—, o sea que ninguna se sirve de un cache estático: son
  // invocaciones reales que compiten con la página que el usuario sí pidió.
  //
  // `prefetch={false}` hasta que hay intención; al primer hover/foco/toque pasa a
  // `null`, que es el valor que restaura el prefetch por defecto de Next. El
  // hover da 100-300 ms de ventaja, suficiente para que el clic siga sintiéndose
  // instantáneo, y el nav móvil oculto ya nunca prefetchea nada.
  const [intent, setIntent] = useState(false)
  const armPrefetch = () => setIntent(true)

  return (
    <Link
      href={href}
      prefetch={intent ? null : false}
      onMouseEnter={armPrefetch}
      onFocus={armPrefetch}
      onTouchStart={armPrefetch}
      className={isActive ? 'nav-item nav-item-active' : 'nav-item'}
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
      {isActive && (
        <m.span
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
      )}
      {Icon && <Icon size={16} strokeWidth={1.6} />}
      <span style={{ flex: 1 }}>{label}</span>
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
    </Link>
  )
}
