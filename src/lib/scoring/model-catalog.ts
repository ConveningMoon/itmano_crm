import type { Dimension } from './vocabulary'

// ── Cómo se explica el modelo de scoring en pantalla ─────────────────────────
//
// La pantalla anterior era una lista plana de 42 números editables: no decía
// qué significaba cada cosa, de dónde salía ni si alguna vez pasaba. Este módulo
// es la explicación, en un solo lugar y en lenguaje de agencia, y decide en qué
// bloque va cada regla.
//
// Módulo PURO: lo usan el Centro de control (servidor) y el editor (cliente).

export type ModelGroupKey = 'perfil' | 'actividad' | 'agente' | 'proteccion'

export interface ModelGroup {
  key:     ModelGroupKey
  title:   string
  summary: string
}

export const MODEL_GROUPS: ModelGroup[] = [
  {
    key: 'perfil',
    title: 'Quién es',
    summary: 'Lo que el lead declara en el formulario o la IA deduce de sus respuestas. Cada factor suma una sola vez y no caduca.',
  },
  {
    key: 'actividad',
    title: 'Qué hace',
    summary: 'Señales que el sistema registra solo. Para la urgencia valen enteras 14 días y luego pierden la mitad cada 30; la calidad las conserva.',
  },
  {
    key: 'agente',
    title: 'Qué registra el agente',
    summary: 'Acciones que el agente marca a mano desde la ficha del lead. No caducan.',
  },
  {
    key: 'proteccion',
    title: 'Protecciones',
    summary: 'No miden interés: cuidan la entrega de correo y la cartera. Se aplican siempre y no se editan desde aquí.',
  },
]

/** Bloque al que pertenece una regla. Lo que tiene efecto secundario es una protección. */
export function groupOf(rule: { category: 'fit' | 'engagement' | 'manual'; sideEffect: string | null }): ModelGroupKey {
  if (rule.sideEffect) return 'proteccion'
  if (rule.category === 'fit') return 'perfil'
  if (rule.category === 'engagement') return 'actividad'
  return 'agente'
}

/** Qué significa cada factor de perfil y por qué suma o resta. */
export const FIT_HELP: Record<Dimension, string> = {
  timeline:        'Cuanto más cerca está su compra o venta, más suma.',
  financing:       'Pagar en efectivo o tener preaprobación indica que puede cerrar ya.',
  budget_tier:     'Comparado con el mercado de la agencia, no como monto absoluto.',
  agent_status:    'Resta si ya trabaja con otro agente: es difícil de captar.',
  contingency:     'Resta si primero debe vender otra propiedad: su compra depende de esa operación.',
  geo_fit:         'Suma si busca o vende donde opera la agencia; resta si está fuera.',
  property_use:    'Se guarda para preparar la conversación, pero no suma: no predice el cierre.',
  sell_motivation: 'Sólo vendedores: cuánta urgencia tiene por vender.',
  listing_status:  'Sólo vendedores: resta si su propiedad ya está listada con otro agente.',
}

/** Qué es cada señal de actividad, acción del agente o protección. */
export const SIGNAL_HELP: Record<string, string> = {
  form_baseline:         'Envió cualquier formulario de la agencia.',
  event_submission:      'Se registró a un evento u open house.',
  open_house_attended:   'El agente marcó su asistencia en la lista del open house.',
  contact_us_question:   'Escribió una pregunta en el formulario de contacto.',
  email_replied:         'Respondió a un correo de la agencia.',
  email_clicked:         'Hizo clic en un enlace de un correo. Las aperturas no cuentan: Apple Mail las simula.',
  second_lm:             'Descargó un segundo recurso gratuito.',
  third_lm:              'Descargó un tercer recurso gratuito o más.',
  visit_attended:        'El agente registró que asistió a una visita.',
  proposal_sent:         'El agente registró que le envió una propuesta.',
  appointment_scheduled: 'El agente registró una cita agendada.',
  no_show_no_answer:     'El agente registró que no se presentó o no contesta.',
  manual_disqualify:     'El agente lo descartó: el lead pasa a Perdido.',
  email_hard_bounce:     'Su correo rebotó: el email se marca como inválido y no se le vuelve a escribir.',
  email_unsubscribed:    'Se dio de baja: no recibe más correos de la agencia.',
  email_spam_complaint:  'Marcó un correo como spam: el lead pasa a Perdido.',
}

export const SIDE_EFFECT_LABELS: Record<string, string> = {
  block_email:        'Bloquea el email',
  mark_email_invalid: 'Marca el email como inválido',
  force_perdido:      'Pasa el lead a Perdido',
  pause_sequences:    'Pausa las secuencias',
}

/** Orden de los factores de perfil en pantalla: comprador primero, vendedor al final. */
export const FIT_DIMENSION_ORDER: Dimension[] = [
  'timeline', 'financing', 'budget_tier', 'agent_status', 'contingency', 'geo_fit',
  'property_use', 'sell_motivation', 'listing_status',
]
