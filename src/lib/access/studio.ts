import type { TenantRole } from '@/lib/auth/tenant-context'

// Control de acceso del Estudio — aislado a propósito, igual que
// canAccessCarouselEngine. Hoy: solo super_admin. Cuando se abra a los tenants,
// esta función pasa a una allowlist o un feature flag y NADA más del código se
// toca (ni la ruta ni las server actions). Úsala en /studio y en CADA action:
// una server action es un endpoint HTTP, la ruta no es la única puerta.
export function canUseStudio(user: { role: TenantRole }): boolean {
  return user.role === 'super_admin'
}
