import type { TenantRole } from '@/lib/auth/tenant-context'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { PLANS } from '@/lib/plans'

// Control de acceso de Newsletters — aislado igual que canUseStudio y
// canAccessCarouselEngine. Úsalo en la página Y en CADA server action: una
// server action es un endpoint HTTP, la ruta no es la única puerta.
//
// A diferencia del Estudio, aquí manda el PLAN y no el rol: es una feature
// vendible. super_admin la ve siempre — es el equipo de ITMANO operando la
// cuenta del cliente.
export function canUseNewsletters(user: { role: TenantRole }, plan: SubscriptionPlan): boolean {
  if (user.role === 'super_admin') return true
  return PLANS[plan].features.newsletters
}
