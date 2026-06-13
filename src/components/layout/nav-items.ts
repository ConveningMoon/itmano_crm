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
  { label: 'Leads',         href: '/leads',     icon: 'Users' },
  { label: 'Fuentes',       href: '/sources',   icon: 'GitBranch' },
  { label: 'Emails',        href: '/emails',    icon: 'Mail' },
  { label: 'Analytics',     href: '/analytics', icon: 'BarChart2' },
  { label: 'Configuración', href: '/settings',  icon: 'Settings' },
]

// super_admin also gets the Admin console link appended.
export function navItemsForRole(role: TenantRole): NavItemDef[] {
  return role === 'super_admin'
    ? [...navItems, { label: 'Admin', href: '/admin', icon: 'ShieldCheck' }]
    : navItems
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
