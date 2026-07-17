'use client'

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
} from 'lucide-react'

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
}

interface NavItemProps {
  label: string
  href: string
  icon: string
  badge?: number
  // Sidebar y MobileNav coexisten montados; cada lista necesita su propio
  // layoutId para que el indicador no salte entre ambas.
  indicatorId?: string
}

export function NavItem({ label, href, icon, badge, indicatorId = 'nav-indicator' }: NavItemProps) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  const Icon = ICONS[icon]

  return (
    <Link
      href={href}
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
