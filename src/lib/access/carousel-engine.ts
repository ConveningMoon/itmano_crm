import type { TenantRole } from '@/lib/auth/tenant-context'

// Control de acceso del Carousel Engine — aislado a propósito. Hoy: solo
// super_admin. Cuando se abra a agentes beta, esta función cambia a una
// allowlist o un feature flag y NADA más del código se toca (ni la ruta ni las
// server actions). Úsala en la página `/admin/carousels` y en cada action.
export function canAccessCarouselEngine(user: { role: TenantRole }): boolean {
  return user.role === 'super_admin'
}
