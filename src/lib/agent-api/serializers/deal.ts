import 'server-only'
import { toIso, toMoney } from '../schemas/common'
import { PIPELINE, type Deal } from '../schemas/deal'
import type { LeadRow } from './lead'

/** Fila cruda de `purchase_processes`. */
export interface DealRow {
  id: string
  lead_id: string
  address: string
  loan_type: string
  closing_date: string | null
  notes: string | null
  completed_at: string | null
  created_at: string | null
}

/**
 * Lo mínimo que hace falta del lead dueño: solo los dos campos prestados. Se
 * pide un `Pick` en vez de la fila entera para que quede explícito que un deal
 * no arrastra la ficha del lead.
 */
export type OwnerLead = Pick<LeadRow, 'stage' | 'budget_amount'>

/**
 * `lead` es la fila del lead dueño, de donde salen los dos campos prestados.
 * Puede faltar (un proceso cuyo lead ya no es visible), y entonces los prestados
 * salen null — nunca inventados.
 */
export function serializeDeal(
  row: DealRow,
  lead: OwnerLead | null,
  currency: string,
): Deal {
  return {
    id:       row.id,
    lead_id:  row.lead_id,
    pipeline: PIPELINE,

    // Invariante del contrato: purchase_processes no tiene importe propio.
    amount: null,

    lead_stage:         (lead?.stage ?? null) as Deal['lead_stage'],
    lead_budget_amount: lead ? toMoney(lead.budget_amount, currency) : null,

    close_date: row.closing_date,
    loan_type:  row.loan_type,
    address:    row.address,
    notes:      row.notes,

    completed_at: toIso(row.completed_at),
    created_at:   toIso(row.created_at),
  }
}
