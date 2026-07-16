// Config compartida de suscripciones (client-safe — sin server-only).
// La fuente única de los planes (precios, límites, features) es
// src/lib/plans.ts; este módulo expone los tipos + labels que consume el CRM.
// La fila por tenant está en `subscriptions` (migraciones 054/055) y se
// administra sales-led hasta que llegue el billing.

import { PLANS, TRIAL, trialDaysLeft } from '@/lib/plans'

export type SubscriptionPlan = 'esencial' | 'growth' | 'partner'
export type SubscriptionStatus = 'trial' | 'active' | 'cancel_requested' | 'change_requested' | 'cancelled'

export interface TenantSubscription {
  plan:          SubscriptionPlan
  status:        SubscriptionStatus
  requestedPlan: SubscriptionPlan | null
  /** Solo cuando status = 'trial'. ISO timestamp. */
  trialEndsAt:   string | null
}

export const PLAN_CONFIG: Record<SubscriptionPlan, {
  label:     string
  inversion: string
  blurb:     string
}> = {
  esencial: {
    label:     PLANS.esencial.label,
    inversion: PLANS.esencial.inversion,
    blurb:     PLANS.esencial.blurb,
  },
  growth: {
    label:     PLANS.growth.label,
    inversion: PLANS.growth.inversion,
    blurb:     PLANS.growth.blurb,
  },
  partner: {
    label:     PLANS.partner.label,
    inversion: PLANS.partner.inversion,
    blurb:     PLANS.partner.blurb,
  },
}

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trial:            'Período de prueba',
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
  if (sub.status === 'trial' && sub.trialEndsAt) {
    const days = trialDaysLeft(sub.trialEndsAt)
    return days > 0 ? `${TRIAL.label} · ${days} día${days === 1 ? '' : 's'}` : `${TRIAL.label} · vencida`
  }
  return `Plan ${PLAN_CONFIG[sub.plan].label}`
}
