import 'server-only'
import { SUPPORTED_LANGUAGE_CODES } from '@/lib/config'

const VALID_LANGS = SUPPORTED_LANGUAGE_CODES as readonly string[]

/**
 * Idioma efectivo de un correo automático dirigido a un lead.
 *
 * La regla: el idioma del lead si el agente lo tiene registrado; si el lead
 * habla uno que el agente NO domina, INGLÉS (no español); y como último recurso
 * el idioma principal del agente.
 *
 * Por qué manda el agente y no sólo el lead: estos correos los firma un agente
 * concreto y las respuestas le llegan a él. Escribirle en portugués a un lead
 * cuyo agente no lo habla produce una conversación que nadie puede seguir.
 *
 * Vivía en closing-emails-status.ts como `resolveClosingLanguage`, y se movió
 * aquí al aparecer el segundo consumidor: las secuencias disparadas por etiqueta
 * (117) eligen su versión de idioma con esta misma regla. La alternativa —dos
 * reglas parecidas— habría hecho que el correo de cierre y el de etiqueta
 * llegaran en idiomas distintos al mismo lead.
 */
export function resolveLeadEmailLanguage(
  agentLanguages: string[] | null | undefined,
  agentPrimary: string,
  leadLanguage: string | null | undefined,
): string {
  const langs = (agentLanguages ?? []).filter(l => VALID_LANGS.includes(l))
  const lead  = leadLanguage && VALID_LANGS.includes(leadLanguage) ? leadLanguage : null
  // 1. El lead recibe su idioma si el agente lo tiene configurado.
  if (lead && langs.includes(lead)) return lead
  // 2. El agente domina inglés → default inglés para leads fuera de su set.
  if (langs.includes('en')) return 'en'
  // 3. Idioma principal del agente como último recurso.
  if (VALID_LANGS.includes(agentPrimary)) return agentPrimary
  return langs[0] ?? 'en'
}
