// La regla ÚNICA de qué puede hacer un tenant según el estado de su suscripción.
// Pura: sin red, sin Supabase. Toda la app consulta este objeto en vez de
// reimplementar la regla en cada superficie.
//
// Principio (spec §6.1): el modo degradado NO es solo-lectura. El tenant sigue
// creando y editando leads, notas, propiedades y agentes con normalidad. Se
// corta exclusivamente lo que le cuesta dinero a ITMANO (IA, envíos por Resend,
// slot de dominio) o lo que constituye entrega de valor continua (propiedades
// publicadas a la web). Un CRM que no deja escribir no es un CRM degradado, es
// un CRM roto, y destruye la posibilidad de recuperar al cliente.
//
// NOTA: este módulo NO lleva `import 'server-only'` a propósito — es puro y los
// tests lo importan directamente. La parte que sí toca Supabase vive aparte en
// `access-server.ts` (Task 11).

import { PLANS } from '@/lib/plans'
import { isDegraded } from '@/lib/paddle/reducer'
import type { SubscriptionPlan, SubscriptionStatus } from '@/lib/subscriptions'

export const DEGRADED_LIMITS = {
  /**
   * Envíos corporativos (por Resend) al mes en modo degradado. El número solo
   * no protege: una secuencia puede quemarlos en un minuto desde una cuenta que
   * nadie supervisa, y eso daña la reputación del dominio COMPARTIDO que usan
   * todos los demás tenants. Por eso además se paran las secuencias: envío
   * humano sí, automatización no. 200/mes son ~7 al día.
   */
  monthlyEmailQuota: 200,
  /**
   * La web pública es el activo del cliente, no de ITMANO. Vaciarla es hostil y
   * quema una relación recuperable; tres la mantiene viva y evidentemente
   * degradada.
   */
  publishedPropertiesCap: 3,
} as const

export const GRACE_DAYS = {
  /** Días para que el owner elija qué propiedades conserva publicadas. */
  properties: 14,
  /** Días antes de liberar el slot de dominio en Resend. */
  sendingDomain: 60,
  /** Un envío vencido más tiempo que esto no se dispara: el run se completa. */
  staleRun: 30,
} as const

/**
 * Guardia de frescura de un run de secuencia. Enviar el "paso 3" a un lead que
 * lleva meses sin saber del agente es malo para el cliente y malo para la
 * deliverability. Se evalúa justo ANTES de enviar, así que cubre cualquier
 * causa de obsolescencia (suscripción caída, cron parado, run reactivado a
 * mano), no solo el impago.
 */
export function isRunStale(nextSendAt: string, now: Date): boolean {
  const days = (now.getTime() - new Date(nextSendAt).getTime()) / 86_400_000
  // Fecha ilegible (NaN): se considera obsoleto. En una guardia que frena
  // envíos, la duda debe resolverse a favor de NO enviar, no al revés.
  if (Number.isNaN(days)) return true
  return days > GRACE_DAYS.staleRun
}

export interface AccessInput {
  status:        SubscriptionStatus
  plan:          SubscriptionPlan
  billingExempt: boolean
}

export interface TenantAccess {
  canUseAi:               boolean
  canCreateSequences:     boolean
  sequencesRunnable:      boolean
  customDomainAllowed:    boolean
  /** null = sin límite propio (rige el del plan). */
  monthlyEmailQuota:      number | null
  /** null = rige el del plan. */
  publishedPropertiesCap: number | null
  /**
   * Si el tenant puede PUBLICAR ediciones de newsletter. A diferencia de las
   * propiedades, aquí no hay tope de retención: el cron de ciclo de vida
   * despublica el archivo entero al agotarse la gracia (un archivo editorial
   * con tres piezas sueltas y `data_as_of` viejo es incoherente, mientras que
   * un catálogo vacío corta la operación comercial del cliente).
   *
   * Por eso este flag existe: sin él, el tenant vuelve a publicar y el cron lo
   * baja al día siguiente, en un bucle silencioso que nadie sabría explicar.
   */
  newslettersPublishable: boolean
  banner: { tone: 'amber' | 'red'; message: string; cta: string } | null
}

// `customDomainAllowed` significa "la facturación no lo revoca", NO "es
// elegible para configurarlo ahora". Un trial es `plan: 'growth'`, así que
// este flag sale en `true` para un trial — pero `plans.ts` es explícito en que
// el trial no debe consumir un slot de dominio de Resend. Hoy eso no se rompe
// porque un trial nunca llega a tener `domain_status = 'verified'` (cae al
// dominio compartido igual), pero la responsabilidad de NO aprovisionar un
// dominio en trial es de la capa de onboarding, no de este flag.
const FULL_ACCESS = (plan: SubscriptionPlan): TenantAccess => ({
  canUseAi:               true,
  canCreateSequences:     true,
  sequencesRunnable:      true,
  customDomainAllowed:    PLANS[plan].features.customSendingDomain,
  monthlyEmailQuota:      null,
  publishedPropertiesCap: null,
  newslettersPublishable: true,
  banner:                 null,
})

export function getTenantAccess(input: AccessInput): TenantAccess {
  // Cortesía (A&J, piloto): nunca se degrada.
  if (input.billingExempt) return FULL_ACCESS(input.plan)

  // past_due conserva TODO el acceso: un fallo de tarjeta no es un impago y
  // Paddle Retain hace el dunning primero (spec §10.4).
  if (input.status === 'past_due') {
    return {
      ...FULL_ACCESS(input.plan),
      banner: {
        tone:    'amber',
        message: 'No pudimos procesar tu inversión de este período. Actualiza los datos de tu tarjeta para no interrumpir tu operación.',
        cta:     'Gestionar inversión',
      },
    }
  }

  if (!isDegraded(input.status)) return FULL_ACCESS(input.plan)

  return {
    canUseAi:               false,
    canCreateSequences:     false,
    sequencesRunnable:      false,
    customDomainAllowed:    false,
    monthlyEmailQuota:      DEGRADED_LIMITS.monthlyEmailQuota,
    publishedPropertiesCap: DEGRADED_LIMITS.publishedPropertiesCap,
    newslettersPublishable: false,
    banner: {
      tone:    'red',
      message: 'Tu suscripción está inactiva. Conservas tus datos y puedes exportarlos; la generación con IA y las secuencias automáticas están en pausa.',
      cta:     'Reactivar suscripción',
    },
  }
}
