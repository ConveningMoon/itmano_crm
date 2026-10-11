// Datos de demostración de la landing. Todos ficticios: ningún nombre, correo
// ni dirección pertenece a un lead, agente o tenant real. Los correos usan
// example.com y la marca del cliente es siempre "tu agencia".
//
// Etapas, calidades y urgencias usan el vocabulario del producto
// (src/lib/scoring/priority.ts): si el CRM cambia una etiqueta o un color, la
// réplica de la landing lo hereda sin tocar este archivo.

import type { QualityBand, Stage, Urgency } from '@/lib/scoring/priority'

export type DemoTone = 'gold' | 'blue' | 'teal' | 'coral' | 'pink' | 'green'
export type DemoLanguage = 'ES' | 'EN' | 'PT'

export interface DemoAgent {
  name: string
  tone: DemoTone
}

export const AGENTS = {
  laura: { name: 'Laura Méndez', tone: 'gold' },
  tomas: { name: 'Tomás Ibarra', tone: 'blue' },
  ana: { name: 'Ana Ruiz', tone: 'teal' },
} as const satisfies Record<string, DemoAgent>

export type AgentKey = keyof typeof AGENTS

/** El briefing con la forma del real (ai-fit-card.tsx): lectura, próximo paso, qué mencionar y a tener en cuenta. */
export interface DemoBriefing {
  read: string
  nextAction: string
  talkingPoints: string[]
  watchOut?: string
}

export interface DemoLead {
  id: string
  name: string
  email: string
  language: DemoLanguage
  agent: AgentKey
  source: string
  stage: Stage
  quality: QualityBand
  urgency: Urgency
  /** "A favor" y "En contra" de la tarjeta de prioridad. */
  pro: string
  con?: string
  briefing: DemoBriefing
  tone: DemoTone
}

export const LEADS: DemoLead[] = [
  {
    id: 'mariana',
    name: 'Mariana González',
    email: 'mariana@example.com',
    language: 'ES',
    agent: 'laura',
    source: 'Guía para vendedores',
    stage: 'nuevo',
    quality: 'alta',
    urgency: 'hoy',
    pro: 'Vende en 1–3 meses · Ya tiene aprobación del banco',
    con: 'Un conocido suyo es agente',
    tone: 'gold',
    briefing: {
      read: 'Vende para mudarse a una casa más grande antes de que empiece el colegio. Ya tiene la aprobación del banco; lo que la frena es no saber en cuánto se vende la suya.',
      nextAction: 'Llamarla hoy y ofrecerle una valoración de su casa esta semana: es lo único que le falta para decidirse.',
      talkingPoints: [
        'Dos casas comparables vendidas en su zona este mes.',
        'La valoración no la compromete a listar contigo.',
      ],
      watchOut: 'Mencionó que un conocido suyo también es agente. Ten lista la razón para trabajar con tu equipo.',
    },
  },
  {
    id: 'jorge',
    name: 'Jorge Lira',
    email: 'jorge@example.com',
    language: 'ES',
    agent: 'tomas',
    source: 'Respondió tu correo',
    stage: 'nutricion',
    quality: 'alta',
    urgency: 'hoy',
    pro: 'Pidió visitar Calle Olmo 12 · Presupuesto confirmado',
    tone: 'coral',
    briefing: {
      read: 'Respondió al segundo correo de la secuencia pidiendo ver Calle Olmo 12 el jueves. Su presupuesto entra justo en el rango de la casa.',
      nextAction: 'Confirmarle la visita del jueves hoy mismo, antes de que agende con otra agencia.',
      talkingPoints: ['La casa tiene una oferta en estudio: conviene verla esta semana.', 'Llevar las cifras de impuestos y cuotas de la zona.'],
    },
  },
  {
    id: 'diego',
    name: 'Diego Ramos',
    email: 'diego@example.com',
    language: 'EN',
    agent: 'ana',
    source: 'Open house del sábado',
    stage: 'nuevo',
    quality: 'media_alta',
    urgency: 'esta_semana',
    pro: 'Confirmó asistencia al open house · Compra en 3–6 meses',
    con: 'Todavía no habla con un banco',
    tone: 'green',
    briefing: {
      read: 'Se muda por trabajo y confirmó el open house del sábado. Compraría en tres a seis meses, pero todavía no habla con un banco.',
      nextAction: 'Escribirle esta semana con dos prestamistas de confianza antes del sábado.',
      talkingPoints: ['Cómo funciona la preaprobación y cuánto tarda.', 'Qué barrios quedan cerca de su nuevo trabajo.'],
      watchOut: 'Sin preaprobación, puede enamorarse de una casa que no le van a financiar.',
    },
  },
  {
    id: 'valeria',
    name: 'Valeria Pardo',
    email: 'valeria@example.com',
    language: 'ES',
    agent: 'laura',
    source: 'Valoración gratuita',
    stage: 'nuevo',
    quality: 'alta',
    urgency: 'hoy',
    pro: 'Pidió valoración · Volvió dos veces a tu web',
    tone: 'teal',
    briefing: {
      read: 'Heredó una casa y quiere venderla antes de fin de año. Pidió la valoración y volvió dos veces a la ficha de una casa parecida.',
      nextAction: 'Llamarla hoy para agendar la visita de valoración.',
      talkingPoints: ['Plazos reales de venta en su zona.', 'Qué documentos necesita una venta por herencia.'],
    },
  },
  {
    id: 'lucia',
    name: 'Lucía Ferrer',
    email: 'lucia@example.com',
    language: 'PT',
    agent: 'tomas',
    source: 'Newsletter del mes',
    stage: 'nuevo',
    quality: 'media',
    urgency: 'esta_semana',
    pro: 'Se suscribió desde la edición de octubre',
    con: 'Busca para dentro de un año',
    tone: 'pink',
    briefing: {
      read: 'Llegó por la newsletter de octubre. Busca invertir en un departamento para alquilar, pero dentro de un año.',
      nextAction: 'Sumarla a la secuencia de inversionistas y escribirle esta semana.',
      talkingPoints: ['Rentabilidad de alquiler por zona.', 'Qué edificios nuevos se entregan el próximo año.'],
    },
  },
  {
    id: 'camila',
    name: 'Camila Soto',
    email: 'camila@example.com',
    language: 'ES',
    agent: 'ana',
    source: 'Página de captura',
    stage: 'nuevo',
    quality: 'media_alta',
    urgency: 'hoy',
    pro: 'Primera casa · Preaprobada',
    tone: 'blue',
    briefing: {
      read: 'Compra su primera casa con su pareja. Ya está preaprobada y descargó tu guía para compradores ayer.',
      nextAction: 'Llamarla hoy y proponerle una visita a dos casas que entran en su presupuesto.',
      talkingPoints: ['Los gastos de cierre que no están en el precio.', 'Programas para primera vivienda.'],
    },
  },
]

/** Ya están en la cola cuando llega el HTML; el resto entra en vivo. */
export const QUEUE_START = ['jorge', 'valeria', 'camila'] as const

export const FUNNEL_START: Record<Stage, number> = {
  nuevo: 14,
  nutricion: 15,
  en_proceso: 8,
  cerrado: 4,
  perdido: 3,
}

export const leadById = (id: string) => LEADS.find(l => l.id === id) ?? LEADS[0]

// ── Kanban ───────────────────────────────────────────────────────────────────

export interface DemoCard {
  id: string
  name: string
  agent: AgentKey
  quality: QualityBand
  source: string
  language: DemoLanguage
  when: string
  stage: Stage
  tone: DemoTone
}

export const KANBAN_START: DemoCard[] = [
  { id: 'k1', name: 'Mariana González', agent: 'laura', quality: 'alta', source: 'Guía', language: 'ES', when: 'hoy', stage: 'nuevo', tone: 'gold' },
  { id: 'k2', name: 'Diego Ramos', agent: 'ana', quality: 'media_alta', source: 'Open house', language: 'EN', when: 'hoy', stage: 'nuevo', tone: 'green' },
  { id: 'k3', name: 'Lucía Ferrer', agent: 'tomas', quality: 'media', source: 'Newsletter', language: 'PT', when: 'ayer', stage: 'nuevo', tone: 'pink' },
  { id: 'k4', name: 'Jorge Lira', agent: 'tomas', quality: 'alta', source: 'Formulario', language: 'ES', when: 'ayer', stage: 'nutricion', tone: 'coral' },
  { id: 'k5', name: 'Camila Soto', agent: 'ana', quality: 'media_alta', source: 'Guía', language: 'ES', when: '2 d', stage: 'nutricion', tone: 'blue' },
  { id: 'k6', name: 'Ricardo Vega', agent: 'laura', quality: 'media_baja', source: 'Referido', language: 'ES', when: '3 d', stage: 'nutricion', tone: 'teal' },
  { id: 'k7', name: 'Valeria Pardo', agent: 'laura', quality: 'alta', source: 'Valoración', language: 'ES', when: '5 d', stage: 'en_proceso', tone: 'teal' },
  { id: 'k8', name: 'Tomás Herrera', agent: 'tomas', quality: 'media', source: 'Evento', language: 'EN', when: '1 sem', stage: 'en_proceso', tone: 'blue' },
  { id: 'k9', name: 'Elena Salas', agent: 'ana', quality: 'alta', source: 'Formulario', language: 'ES', when: '2 sem', stage: 'cerrado', tone: 'green' },
]

/** Movimientos que hace un agente, en orden, en bucle: la etapa la mueve una persona. */
export const KANBAN_MOVES: { card: string; to: Stage; by: AgentKey }[] = [
  { card: 'k4', to: 'en_proceso', by: 'tomas' },
  { card: 'k1', to: 'nutricion', by: 'laura' },
  { card: 'k7', to: 'cerrado', by: 'laura' },
  { card: 'k2', to: 'nutricion', by: 'ana' },
]

// ── Propiedades ──────────────────────────────────────────────────────────────
// Fotos de Unsplash (licencia Unsplash: uso comercial libre, sin atribución
// obligatoria), reducidas a WebP de 1200 px en public/landing/:
//   casa-porche.webp   ← https://images.unsplash.com/photo-1570129477492-45c003edd2be
//   casa-moderna.webp  ← https://images.unsplash.com/photo-1600585154340-be6161a56a0c
//   casa-noche.webp    ← https://images.unsplash.com/photo-1568605114967-8130f3a36994
//   sala.webp          ← https://images.unsplash.com/photo-1600607687939-ce8a6c25118c

export interface DemoProperty {
  id: string
  address: string
  area: string
  price: string
  beds: number
  baths: string
  size: string
  mls: string
  status: 'Disponible' | 'En proceso' | 'Vendida'
  web: boolean
  photo: string
  photoAlt: string
}

export const PROPERTIES: DemoProperty[] = [
  {
    id: 'olmo',
    address: 'Calle Olmo 12',
    area: 'Barrio Los Robles',
    price: '$485,000',
    beds: 4,
    baths: '2.5',
    size: '212 m²',
    mls: 'MLS #20481',
    status: 'Disponible',
    web: true,
    photo: '/landing/casa-porche.webp',
    photoAlt: 'Casa de dos pisos con porche blanco y jardín al frente',
  },
  {
    id: 'cedro',
    address: 'Av. del Cedro 340',
    area: 'Lomas del Parque',
    price: '$712,000',
    beds: 3,
    baths: '3',
    size: '268 m²',
    mls: 'MLS #20517',
    status: 'En proceso',
    web: true,
    photo: '/landing/casa-moderna.webp',
    photoAlt: 'Casa moderna de madera oscura y vidrio, con jardín, al atardecer',
  },
  {
    id: 'pino',
    address: 'Camino del Pino 8',
    area: 'Valle Alto',
    price: '$529,900',
    beds: 3,
    baths: '2',
    size: '184 m²',
    mls: 'MLS #20366',
    status: 'Vendida',
    web: false,
    photo: '/landing/casa-noche.webp',
    photoAlt: 'Casa de madera con techo a dos aguas y ventanas iluminadas de noche',
  },
]

export function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map(part => part[0])
    .join('')
}
