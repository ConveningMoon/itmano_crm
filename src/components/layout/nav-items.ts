import type { TenantRole } from '@/lib/auth/tenant-context'

// Shared navigation data — consumed by the desktop Sidebar and the mobile drawer
// so both stay in sync. Pure data (no JSX), safe to import from client + server.

export interface NavItemDef {
  label: string
  href:  string
  icon:  string
  // Etiqueta de texto ("Pronto") para una ruta visible pero todavía cerrada.
  // Distinta de `badge` (numérico, contadores) a propósito: no debe pintarse en
  // dorado ni competir con los contadores de solicitudes/notificaciones.
  badgeLabel?: string
}

export interface NavGroupDef {
  // null: lista sin encabezado (modo hub).
  label: string | null
  items: NavItemDef[]
}

export const navGroups: NavGroupDef[] = [
  {
    label: 'Trabajo',
    items: [
      { label: 'Dashboard',   href: '/dashboard',  icon: 'LayoutDashboard' },
      { label: 'Leads',       href: '/leads',      icon: 'Users' },
      { label: 'Propiedades', href: '/properties', icon: 'Building2' },
      { label: 'Analytics',   href: '/analytics',  icon: 'BarChart2' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Newsletters', href: '/newsletters', icon: 'Newspaper' },
      { label: 'Fuentes',     href: '/sources',     icon: 'GitBranch' },
      { label: 'Emails',      href: '/emails',      icon: 'Mail' },
      { label: 'Estudio',     href: '/studio',      icon: 'Sparkles', badgeLabel: 'Pronto' },
    ],
  },
  {
    label: 'Cuenta',
    items: [
      { label: 'Configuración', href: '/settings', icon: 'Settings' },
      { label: 'Soporte',       href: '/soporte',  icon: 'LifeBuoy' },
    ],
  },
]

export const navItems: NavItemDef[] = navGroups.flatMap(g => g.items)

// El Estudio sin el badge "Pronto": para super_admin la página es real.
const STUDIO_OPEN: NavItemDef = { label: 'Estudio', href: '/studio', icon: 'Sparkles' }

// super_admin gets the control-center group appended. In hub mode (super_admin
// without a selected tenant) the tenant pages would all redirect to the hub, so
// the nav collapses to the only routes that make sense there.
export function navGroupsForRole(role: TenantRole, opts?: { hubMode?: boolean }): NavGroupDef[] {
  if (role !== 'super_admin') return navGroups
  if (opts?.hubMode) {
    return [{
      label: null,
      items: [
        { label: 'Centro de control', href: '/admin', icon: 'ShieldCheck' },
        STUDIO_OPEN,
        { label: 'Solicitudes', href: '/solicitudes', icon: 'Inbox' },
        { label: 'Notificaciones', href: '/notifications', icon: 'Bell' },
      ],
    }]
  }
  return [
    ...navGroups.map(g => ({ ...g, items: g.items.map(i => (i.href === '/studio' ? STUDIO_OPEN : i)) })),
    {
      label: 'Administración',
      items: [
        { label: 'Centro de control', href: '/admin', icon: 'ShieldCheck' },
        { label: 'Solicitudes', href: '/solicitudes', icon: 'Inbox' },
      ],
    },
  ]
}

export function navItemsForRole(role: TenantRole, opts?: { hubMode?: boolean }): NavItemDef[] {
  return navGroupsForRole(role, opts).flatMap(g => g.items)
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
