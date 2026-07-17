// Fuente única de verdad de los planes de suscripción de ITMANO CRM.
// Client-safe (sin server-only): la consumen la landing, /planes, el CRM
// (settings/sidebar vía subscriptions.ts) y el Centro de control.
//
// Posicionamiento (análisis de mercado 2026-07): Esencial compite por volumen
// entre agentes independientes (mercado solo: $30–150/mes EE.UU., €29–79
// España); Growth concentra el margen y la IA generativa completa; Partner
// captura equipos 2+ agentes con multi-login (los suites de equipo del
// mercado — Lofty/BoldTrail — parten de $449–499/asiento).
//
// Enforcement real HOY: solo el presupuesto de IA (ai_monthly_limit_usd,
// migración 053, aplicado en src/lib/services/ai-limit.ts). Los demás límites
// son contractuales: los administra el super_admin desde el Centro de control
// hasta que llegue la fase de billing con enforcement en código.

import type { SubscriptionPlan } from '@/lib/subscriptions'

export interface PlanLimits {
  /** Usuarios con acceso de login. Partner: base incluida, ampliable. */
  logins: number | 'multiple'
  /** Miembros del equipo rastreados (routing, métricas, colores). */
  trackedAgents: number | 'unlimited'
  /** Leads / contactos activos. */
  leads: number | 'unlimited'
  /** Emails salientes por mes calendario (secuencias + one-offs). */
  emailsPerMonth: number
  /** Propiedades publicadas a la web del cliente. null = feature no incluida. */
  webProperties: number | 'unlimited' | null
  /** Presupuesto de IA por mes calendario (USD) — default de ai_monthly_limit_usd. */
  aiBudgetUsd: number
}

export interface PlanFeatures {
  aiEmailDrafting: boolean      // composer + bootstrap de secuencias
  aiPropertyIntake: boolean     // "Crear con IA" desde PDF
  webPropertySync: boolean      // propiedades → sitio web del cliente
  fullAnalytics: boolean        // analytics completo (agente/canal/email)
  teamAnalytics: boolean        // vista consolidada de equipo
  multiLogin: boolean           // logins de agente con visibilidad propia
}

export interface PlanDefinition {
  key: SubscriptionPlan
  label: string
  /** Precio mensual en USD. null = personalizado (desde basePrice). */
  priceUsd: number | null
  /** Para Partner: precio base "desde". */
  basePriceUsd?: number
  /** String de inversión para UI ("$59 / mes", "desde $249 / mes"). */
  inversion: string
  audience: string
  blurb: string
  limits: PlanLimits
  features: PlanFeatures
  onboarding: string
  support: string
  highlighted: boolean
}

export const PLANS: Record<SubscriptionPlan, PlanDefinition> = {
  esencial: {
    key: 'esencial',
    label: 'Esencial',
    priceUsd: 59,
    inversion: '$59 / mes',
    audience: 'Agentes independientes que empiezan a ordenar su operación.',
    blurb: 'CRM completo con scoring automático, secuencias de email y IA para arrancar.',
    limits: {
      logins: 1,
      trackedAgents: 1,
      leads: 2500,
      emailsPerMonth: 3000,
      webProperties: null,
      aiBudgetUsd: 8,
    },
    features: {
      aiEmailDrafting: true,
      aiPropertyIntake: false,
      webPropertySync: false,
      fullAnalytics: false,
      teamAnalytics: false,
      multiLogin: false,
    },
    onboarding: 'Guiado (autoservicio con nuestro equipo a un email)',
    support: 'Email',
    highlighted: false,
  },
  growth: {
    key: 'growth',
    label: 'Growth',
    priceUsd: 129,
    inversion: '$129 / mes',
    audience: 'Independientes pro que quieren la IA completa y su web alimentada por el CRM.',
    blurb: 'Toda la IA generativa, propiedades sincronizadas con tu web y analytics completo.',
    limits: {
      logins: 1,
      trackedAgents: 3,
      leads: 10000,
      emailsPerMonth: 15000,
      webProperties: 50,
      aiBudgetUsd: 30,
    },
    features: {
      aiEmailDrafting: true,
      aiPropertyIntake: true,
      webPropertySync: true,
      fullAnalytics: true,
      teamAnalytics: false,
      multiLogin: false,
    },
    onboarding: 'Asistido (configuramos canales y secuencias contigo)',
    support: 'Email prioritario',
    highlighted: true,
  },
  partner: {
    key: 'partner',
    label: 'Partner',
    priceUsd: null,
    basePriceUsd: 249,
    inversion: 'desde $249 / mes',
    audience: 'Equipos y grupos inmobiliarios: 2 o más agentes con acceso propio.',
    blurb: 'Multi-login por agente, todo ilimitado y onboarding dedicado con migración de datos.',
    limits: {
      logins: 'multiple', // base: owner + 2 agentes; +$49/mes por login adicional
      trackedAgents: 'unlimited',
      leads: 'unlimited',
      emailsPerMonth: 50000,
      webProperties: 'unlimited',
      aiBudgetUsd: 75,
    },
    features: {
      aiEmailDrafting: true,
      aiPropertyIntake: true,
      webPropertySync: true,
      fullAnalytics: true,
      teamAnalytics: true,
      multiLogin: true,
    },
    onboarding: 'Dedicado + migración de datos (HubSpot y otros)',
    support: 'Prioritario + contacto directo',
    highlighted: false,
  },
}

export const PLAN_ORDER: SubscriptionPlan[] = ['esencial', 'growth', 'partner']

/** Logins incluidos en la base de Partner y costo de cada login adicional. */
export const PARTNER_SEAT = { includedLogins: 3, extraLoginUsd: 49 }

// ─── Período de prueba ────────────────────────────────────────────────────────
// Gancho de adquisición sales-led: 14 días con la experiencia Partner completa,
// sin tarjeta (no hay procesador de pagos — es literalmente cierto). La IA
// lleva un presupuesto de cortesía (no ilimitado: el costo lo paga ITMANO y un
// trial sin tope es abusable; $25 en 14 días se siente ilimitado en la
// práctica). El super_admin puede extender el vencimiento desde el Centro de
// control. Sin lockout automático al vencer: el Centro de control lo marca y
// el equipo gestiona la conversión (modelo sales-led).

export const TRIAL = {
  days: 14,
  /** El trial vive como plan='partner' + status='trial'. */
  plan: 'partner' as SubscriptionPlan,
  /** Presupuesto de IA de cortesía durante la prueba (USD). */
  aiBudgetUsd: 25,
  label: 'Prueba Partner',
} as const

export function trialEndsAtFromNow(): Date {
  const d = new Date()
  d.setDate(d.getDate() + TRIAL.days)
  return d
}

/** Días restantes de prueba (0 si ya venció). */
export function trialDaysLeft(trialEndsAt: string | Date): number {
  const end = typeof trialEndsAt === 'string' ? new Date(trialEndsAt) : trialEndsAt
  const ms = end.getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86_400_000))
}
