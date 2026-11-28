import { PLANS, PLAN_ORDER, PARTNER_SEAT, type PlanLimits } from '@/lib/plans'

// Filas de la comparativa de /planes. Función pura y sin React para poder
// probarla: todo número o tope que la landing promete sale de PLANS (fuente
// única) y de nada más. Una fila de "Capacidad" que no tenga respaldo en
// `limits` o `features` no debe existir: lo que se promete aquí lo aplica
// src/lib/subscriptions/entitlements.ts.

export type CellValue = string | boolean // false → guion, true → check, string → texto

export interface CompareRow {
  label: string
  values: [CellValue, CellValue, CellValue] // esencial, growth, partner
}

export interface CompareGroup {
  title: string
  rows: CompareRow[]
}

type Unlimitable = number | 'unlimited' | null

/** Número formateado, o `unlimited` ('Ilimitados' / 'Ilimitadas'); null → guion. */
function fmt(v: Unlimitable, unlimited = 'Ilimitados'): CellValue {
  if (v === null) return false
  return typeof v === 'number' ? v.toLocaleString('en-US') : unlimited
}

/** Misma fila para los tres planes a partir de un campo de `limits`. */
function perPlan(pick: (l: PlanLimits) => Unlimitable, unlimited?: string): CompareRow['values'] {
  const [a, b, c] = PLAN_ORDER.map(p => fmt(pick(PLANS[p].limits), unlimited))
  return [a, b, c]
}

/** Misma fila para los tres planes a partir de un interruptor de `features`. */
function perFeature(pick: (f: (typeof PLANS)['esencial']['features']) => boolean): CompareRow['values'] {
  return [pick(PLANS.esencial.features), pick(PLANS.growth.features), pick(PLANS.partner.features)]
}

export function buildPlanRows(): CompareGroup[] {
  return [
    {
      title: 'Capacidad',
      rows: [
        {
          label: 'Accesos con sesión propia',
          values: [
            String(PLANS.esencial.limits.logins),
            String(PLANS.growth.limits.logins),
            `${PARTNER_SEAT.includedLogins} incluidos · +$${PARTNER_SEAT.extraLoginUsd}/mes por agente extra`,
          ],
        },
        { label: 'Agentes del equipo con seguimiento', values: perPlan(l => l.trackedAgents) },
        { label: 'Leads / contactos', values: perPlan(l => l.leads) },
        { label: 'Correos por mes', values: perPlan(l => l.emailsPerMonth) },
        { label: 'Propiedades publicadas en tu web', values: perPlan(l => l.webProperties, 'Ilimitadas') },
        {
          // Público en tokens — el presupuesto en USD es referencia interna de ITMANO.
          label: 'Capacidad de IA incluida al mes',
          values: [
            `≈ ${PLANS.esencial.limits.aiTokensLabel}`,
            `≈ ${PLANS.growth.limits.aiTokensLabel}`,
            `≈ ${PLANS.partner.limits.aiTokensLabel} · ampliable`,
          ],
        },
      ],
    },
    {
      title: 'Producto',
      rows: [
        { label: 'Calificación automática de cada lead que entra', values: [true, true, true] },
        { label: 'Tu lista del día, ordenada sola', values: [true, true, true] },
        { label: 'Secuencias de correo automáticas', values: [true, true, true] },
        { label: 'Captación conectada (páginas, guías, eventos y formularios)', values: [true, true, true] },
        { label: 'Importación de tus contactos (CSV / Excel)', values: [true, true, true] },
        { label: 'Aviso instantáneo cuando un lead se pone caliente', values: [true, true, true] },
        { label: 'Asignación por idioma (español, inglés, portugués)', values: [true, true, true] },
        {
          // Solución A: Esencial envía desde el dominio compartido de ITMANO con la
          // marca del tenant en el nombre visible; Growth/Partner reciben su propio
          // dominio de envío verificado (mail.tudominio.com), gestionado por ITMANO.
          label: 'Identidad de tus correos',
          values: [
            'Marca propia visible (dominio gestionado ITMANO)',
            'Dominio de envío propio (mail.tudominio.com)',
            'Dominio de envío propio (mail.tudominio.com)',
          ],
        },
        { label: 'Propiedades sincronizadas con tu sitio web', values: perFeature(f => f.webPropertySync) },
        { label: 'Newsletters', values: perFeature(f => f.newsletters) },
        // Los reportes del negocio son iguales en los tres planes: el único
        // derecho que gradúa analytics es la vista consolidada de equipo
        // (entitlement teamAnalytics, sólo Partner). No se prometen "niveles".
        { label: 'Reportes del negocio (agente, fuente y correo)', values: [true, true, true] },
        { label: 'Vista consolidada de equipo', values: perFeature(f => f.teamAnalytics) },
      ],
    },
    {
      title: 'Inteligencia artificial',
      rows: [
        { label: 'Análisis de cada lead y briefing para el agente', values: [true, true, true] },
        { label: 'Calificación adaptada a tu mercado y tus zonas', values: [true, true, true] },
        { label: 'Redacción de correos con la voz de cada agente', values: [true, true, true] },
        { label: 'Secuencias generadas en un clic', values: [true, true, true] },
        { label: 'Alta de propiedades desde un PDF', values: perFeature(f => f.aiPropertyIntake) },
      ],
    },
    {
      title: 'Acompañamiento',
      rows: [
        { label: 'Puesta en marcha', values: ['Guiada', 'Asistida', 'Dedicada'] },
        { label: 'Migración de tus datos (HubSpot y otros)', values: [false, false, true] },
        { label: 'Soporte', values: ['Email', 'Email prioritario', 'Prioritario + contacto directo'] },
      ],
    },
  ]
}
