import type { TenantRole } from '@/lib/auth/tenant-context'

// Navegación de /settings: qué pestañas ve cada rol y cómo se agrupan.
// Sin React a propósito: `icon` es el nombre de un icono de lucide y quien
// renderiza lo resuelve. Así la lógica de permisos se prueba sin DOM.

export type SettingsTab =
  | 'perfil' | 'agentes' | 'negocio' | 'etiquetas' | 'email' | 'scoring' | 'ia' | 'cuenta'

export interface SettingsNavItem {
  value: SettingsTab
  label: string
  icon: string
}

export interface SettingsNavGroup {
  group: string
  items: SettingsNavItem[]
}

// Roles que ven cada pestaña.
//  - Negocio y Etiquetas: describen al equipo (comisión, rangos, zonas) y su
//    vocabulario de etiquetas, que engancha las secuencias obligatorias. Los
//    administran owner/super; un agente aplica etiquetas desde la ficha del
//    lead, no las crea, y el dato del negocio tampoco es suyo.
//  - Scoring: el modelo lo administra ITMANO, así que sólo existe para
//    super_admin. Una sección de inputs deshabilitados invita a tocarlos.
const ALL: readonly TenantRole[] = ['super_admin', 'agent_owner', 'agent']
const MANAGERS: readonly TenantRole[] = ['super_admin', 'agent_owner']
const SUPER_ONLY: readonly TenantRole[] = ['super_admin']

const NAV: ReadonlyArray<{
  group: string
  items: ReadonlyArray<SettingsNavItem & { roles: readonly TenantRole[] }>
}> = [
  {
    group: 'Equipo',
    items: [
      { value: 'perfil',  label: 'Perfil del equipo', icon: 'Building2', roles: ALL },
      { value: 'agentes', label: 'Agentes',           icon: 'Users',     roles: ALL },
    ],
  },
  {
    group: 'Negocio',
    items: [
      { value: 'negocio',   label: 'Tu negocio', icon: 'BarChart3', roles: MANAGERS },
      { value: 'etiquetas', label: 'Etiquetas',  icon: 'Tag',       roles: MANAGERS },
    ],
  },
  {
    group: 'Comunicación',
    items: [
      { value: 'email', label: 'Email', icon: 'Mail', roles: ALL },
    ],
  },
  {
    group: 'Sistema',
    items: [
      { value: 'scoring', label: 'Scoring',         icon: 'Gauge',    roles: SUPER_ONLY },
      { value: 'ia',      label: 'Uso de IA',       icon: 'Sparkles', roles: ALL },
      { value: 'cuenta',  label: 'Cuenta y acceso', icon: 'KeyRound', roles: ALL },
    ],
  },
]

/** Grupos y pestañas visibles para el rol. Los grupos vacíos no se devuelven. */
export function settingsNavForRole(role: TenantRole): SettingsNavGroup[] {
  return NAV
    .map(({ group, items }) => ({
      group,
      items: items
        .filter(item => item.roles.includes(role))
        .map(({ value, label, icon }) => ({ value, label, icon })),
    }))
    .filter(g => g.items.length > 0)
}

/**
 * Pestaña inicial a partir de `?tab=`. Un valor ausente, desconocido o que el
 * rol no puede ver (p. ej. un enlace viejo a `scoring`) cae a 'perfil' en vez
 * de abrir una pestaña inexistente.
 */
export function resolveSettingsTab(raw: string | null, role: TenantRole): SettingsTab {
  const found = settingsNavForRole(role)
    .flatMap(g => g.items)
    .find(item => item.value === raw)
  return found ? found.value : 'perfil'
}
