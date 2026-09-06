import 'server-only'
import { toIso, toMoney } from '../schemas/common'
import type { Lead, Contact } from '../schemas/lead'

/** Fila cruda de la vista `leads_list`. */
export interface LeadRow {
  id: string
  first_name: string
  last_name: string | null
  email: string
  phone: string | null
  language: string | null
  notes: string | null
  stage: string
  quality_band: string | null
  urgency: string | null
  agent_id: string | null
  current_score: number | null
  fit_score: number | null
  engagement_score: number | null
  manual_score: number | null
  budget_amount: string | number | null
  created_at: string
  updated_at: string | null
}

export function serializeLead(row: LeadRow, currency: string): Lead {
  return {
    id:         row.id,
    first_name: row.first_name,
    last_name:  row.last_name,
    email:      row.email,
    phone:      row.phone,
    language:   row.language,
    notes:      row.notes,

    stage:        row.stage as Lead['stage'],
    quality_band: (row.quality_band ?? null) as Lead['quality_band'],
    urgency:      (row.urgency ?? null) as Lead['urgency'],
    owner:        row.agent_id,

    score: {
      total:      row.current_score    ?? 0,
      fit:        row.fit_score        ?? 0,
      engagement: row.engagement_score ?? 0,
      manual:     row.manual_score     ?? 0,
    },
    budget: toMoney(row.budget_amount, currency),

    // toIso nunca devuelve null para created_at: la columna es NOT NULL.
    created_at: toIso(row.created_at)!,
    updated_at: toIso(row.updated_at),
  }
}

/** Misma fila, forma de contacto: sin scoring, etapa ni presupuesto. */
export function serializeContact(row: LeadRow): Contact {
  return {
    id:         row.id,
    first_name: row.first_name,
    last_name:  row.last_name,
    email:      row.email,
    phone:      row.phone,
    language:   row.language,
    owner:      row.agent_id,
    created_at: toIso(row.created_at)!,
  }
}
