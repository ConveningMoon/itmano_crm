'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Users,
  FileDown,
  BarChart2,
  Settings,
  GitBranch,
  Mail,
  ShieldCheck,
} from 'lucide-react'

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  LayoutDashboard,
  Users,
  FileDown,
  BarChart2,
  Settings,
  GitBranch,
  Mail,
  ShieldCheck,
}

interface NavItemProps {
  label: string
  href: string
  icon: string
  badge?: number
}

export function NavItem({ label, href, icon, badge }: NavItemProps) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
  const Icon = ICONS[icon]

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 12px',
        borderRadius: '6px',
        textDecoration: 'none',
        fontSize: '13px',
        fontWeight: isActive ? '500' : '400',
        color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
        backgroundColor: isActive ? 'rgba(201,169,110,0.08)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent-gold)' : '2px solid transparent',
        transition: 'all 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => {
        if (!isActive) {
          const el = e.currentTarget as HTMLElement
          el.style.backgroundColor = 'var(--bg-elevated)'
          el.style.color = 'var(--text-primary)'
        }
      }}
      onMouseLeave={e => {
        if (!isActive) {
          const el = e.currentTarget as HTMLElement
          el.style.backgroundColor = 'transparent'
          el.style.color = 'var(--text-secondary)'
        }
      }}
    >
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
