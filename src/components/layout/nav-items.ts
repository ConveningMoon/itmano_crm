import type { TenantRole } from '@/lib/auth/tenant-context'

// Shared navigation data — consumed by the desktop Sidebar and the mobile drawer
// so both stay in sync. Pure data (no JSX), safe to import from client + server.

export interface NavItemDef {
  label: string
  href:  string
  icon:  string
}

export const navItems: NavItemDef[] = [
  { label: 'Dashboard',     href: '/dashboard', icon: 'LayoutDashboard' },
  { label: 'Leads',         href: '/leads',       icon: 'Users'      },
  { label: 'Propiedades',   href: '/properties', icon: 'Building2'  },
  { label: 'Fuentes',       href: '/sources',    icon: 'GitBranch'  },
  { label: 'Emails',        href: '/emails',    icon: 'Mail' },
  { label: 'Analytics',     href: '/analytics', icon: 'BarChart2' },
  { label: 'Configuración', href: '/settings',  icon: 'Settings' },
  { label: 'Soporte',       href: '/soporte',   icon: 'LifeBuoy' },
]

// super_admin gets the control-center link appended. In hub mode (super_admin
// without a selected tenant) the tenant pages would all redirect to the hub, so
// the nav collapses to the only two routes that make sense there.
export function navItemsForRole(role: TenantRole, opts?: { hubMode?: boolean }): NavItemDef[] {
  if (role !== 'super_admin') return navItems
  if (opts?.hubMode) {
    return [
      { label: 'Centro de control', href: '/admin', icon: 'ShieldCheck' },
      { label: 'Solicitudes', href: '/solicitudes', icon: 'Inbox' },
      { label: 'Notificaciones', href: '/notifications', icon: 'Bell' },
    ]
  }
  return [
    ...navItems,
    { label: 'Centro de control', href: '/admin', icon: 'ShieldCheck' },
    { label: 'Solicitudes', href: '/solicitudes', icon: 'Inbox' },
  ]
}

export const ROLE_LABELS: Record<TenantRole, string> = {
  super_admin: 'Administrador ITMANO',
  agent_owner: 'Propietario',
  agent:       'Agente',
}

export function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local.slice(0, 2).toUpperCase() || '??'
}
