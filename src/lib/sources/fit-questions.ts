// ¿Esta fuente hace preguntas de filtrado (plazo, financiamiento, presupuesto…)?
//
// Hay fuentes que a propósito no las hacen: el registro de asistencia a un
// evento sólo pide nombre y acompañantes, y la señal de esos leads llega
// después, por los correos. La salud del scoring usa esta propiedad para no
// culpar a un formulario que nunca quiso preguntar, y para señalar al que sí
// debería y llega sin perfil.
//
// `acquisition_channels.asks_fit_questions` null = según el tipo. La misma
// regla vive en SQL, en `channel_asks_fit_questions` (migración
// 20261128130000): si cambia aquí, cambia allí.
//
// Módulo PURO.

export const FIT_QUESTION_CHANNEL_TYPES = ['lead_magnet', 'contact_form', 'manychat_flow'] as const

export function asksFitQuestions(channelType: string | null | undefined, explicit: boolean | null | undefined): boolean {
  if (typeof explicit === 'boolean') return explicit
  return (FIT_QUESTION_CHANNEL_TYPES as readonly string[]).includes(channelType ?? '')
}
