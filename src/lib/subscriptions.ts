// Config compartida de suscripciones (client-safe — sin server-only).
// Los planes públicos viven en la landing; este módulo es la única fuente de
// labels/inversión para el CRM. La fila por tenant está en `subscriptions`
// (migración 054) y se administra sales-led hasta que llegue el billing.

export type SubscriptionPlan = 'esencial' | 'growth' | 'partner'
export type SubscriptionStatus = 'active' | 'cancel_requested' | 'change_requested' | 'cancelled'

export interface TenantSubscription {
  plan:          SubscriptionPlan
  status:        SubscriptionStatus
  requestedPlan: SubscriptionPlan | null
}

export const PLAN_CONFIG: Record<SubscriptionPlan, {
  label:     string
  inversion: string
  blurb:     string
}> = {
  esencial: {
    label:     'Esencial',
    inversion: '$149 / mes',
    blurb:     'CRM completo con scoring automático y nurturing por email.',
  },
  growth: {
    label:     'Growth',
    inversion: '$299 / mes',
    blurb:     'Todo Esencial, más canales de adquisición, analytics avanzado e IA.',
  },
  partner: {
    label:     'Partner',
    inversion: 'Inversión personalizada',
    blurb:     'Infraestructura de crecimiento completa, a la medida del equipo.',
  },
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active:           'Activa',
  cancel_requested: 'Cancelación solicitada',
  change_requested: 'Cambio de plan solicitado',
  cancelled:        'Cancelada',
}

export const PLAN_ORDER: SubscriptionPlan[] = ['esencial', 'growth', 'partner']

// Label corto para el sidebar (bajo el nombre del usuario).
export function planBadgeLabel(sub: TenantSubscription | null): string | null {
  if (!sub) return null
  if (sub.status === 'cancelled') return 'Suscripción cancelada'
  return `Plan ${PLAN_CONFIG[sub.plan].label}`
}
