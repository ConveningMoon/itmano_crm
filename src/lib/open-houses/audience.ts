// Audiencia de los correos de un open house. PURO respecto a la base: recibe
// los leads ya leídos y decide, uno por uno, si reciben el correo y en qué
// idioma, o por qué no.
//
// La regla de idioma es la de los correos de cierre y de etiqueta
// (resolveLeadEmailLanguage): el del lead si su agente lo atiende, inglés si
// no. Si el open house no tiene versión en ese idioma, el lead no recibe nada
// — mandar en otro idioma es peor que no mandar.

import { resolveLeadEmailLanguage } from '@/lib/services/lead-email-language'
import type { AudienceMatch, SkipReason } from './model'

export interface AudienceLead {
  id:             string
  email:          string | null
  emailBlocked:   boolean
  language:       string | null
  agentLanguages: string[] | null
  agentPrimary:   string
  tagIds:         string[]
}

/**
 * ¿El lead entra en la audiencia del anuncio? `any` = tiene al menos una de
 * las etiquetas; `all` = las tiene todas. Una lista vacía no selecciona a
 * nadie: "sin etiquetas" nunca puede significar "todo el tenant".
 */
export function matchesAudience(
  leadTagIds:     readonly string[],
  audienceTagIds: readonly string[],
  match:          AudienceMatch,
): boolean {
  if (audienceTagIds.length === 0) return false
  const has = new Set(leadTagIds)
  return match === 'all'
    ? audienceTagIds.every(t => has.has(t))
    : audienceTagIds.some(t => has.has(t))
}

export type RecipientDecision =
  | { send: true;  language: string }
  | { send: false; reason: SkipReason; language: string | null }

export function decideRecipient(lead: AudienceLead, languages: readonly string[]): RecipientDecision {
  const email = lead.email?.trim()
  if (!email) return { send: false, reason: 'no_email', language: null }
  if (lead.emailBlocked) return { send: false, reason: 'email_blocked', language: null }

  const language = resolveLeadEmailLanguage(lead.agentLanguages, lead.agentPrimary, lead.language)
  if (!languages.includes(language)) return { send: false, reason: 'no_language', language }
  return { send: true, language }
}

export interface AudienceSummary {
  total:      number
  toSend:     number
  byLanguage: Record<string, number>
  skipped:    Partial<Record<SkipReason, number>>
}

export function summarizeAudience(
  leads:     AudienceLead[],
  languages: readonly string[],
): AudienceSummary {
  const summary: AudienceSummary = { total: leads.length, toSend: 0, byLanguage: {}, skipped: {} }
  for (const lead of leads) {
    const d = decideRecipient(lead, languages)
    if (d.send) {
      summary.toSend++
      summary.byLanguage[d.language] = (summary.byLanguage[d.language] ?? 0) + 1
    } else {
      summary.skipped[d.reason] = (summary.skipped[d.reason] ?? 0) + 1
    }
  }
  return summary
}

/** Parte una lista en lotes de `size` (la API batch de Resend acepta 100). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error('chunk size must be positive')
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
