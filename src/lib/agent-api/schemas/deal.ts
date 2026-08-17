import { z } from 'zod'
import { MoneySchema, PII } from './common'
import { StageSchema } from './lead'

/** Este CRM tiene un único pipeline. Se declara para que el consumidor no lo invente. */
export const PIPELINE = 'compra' as const

/**
 * Un "deal" aquí es una fila de `purchase_processes`: el proceso de compra de un
 * lead. NO tiene importe ni etapa propios.
 *
 * Regla del contrato: un dato que no existe sale `null`, y un campo tomado de
 * otra entidad lleva nombre prestado (`lead_*`). Un importe inventado sería peor
 * que un hueco, porque un agente conversacional lo diría en voz alta como si
 * fuera un hecho.
 */
export const DealSchema = z.object({
  id:      z.string().meta({ description: 'uuid de purchase_processes.' }),
  lead_id: z.string().meta({ description: 'Id del lead dueño del proceso.' }),

  pipeline: z.literal(PIPELINE),

  amount: MoneySchema.meta({
    description:
      'SIEMPRE null: purchase_processes no tiene columna de importe. Si algún día ' +
      'existe, este campo la usará. Para el presupuesto del lead, ver lead_budget_amount.',
  }),

  lead_stage: StageSchema.nullable().meta({
    description: 'PRESTADO de leads.stage del lead dueño. No es una etapa del proceso.',
  }),
  lead_budget_amount: MoneySchema.meta({
    ...PII,
    description: 'PRESTADO de leads.budget_amount. Es lo que declaró el lead, no el valor de la operación.',
  }),

  close_date: z.string().nullable().meta({
    description: 'purchase_processes.closing_date (YYYY-MM-DD). Null si no hay cierre previsto.',
  }),
  // address y loan_type son NOT NULL en purchase_processes: siempre vienen.
  loan_type: z.string(),
  address:   z.string().meta({ ...PII }),
  notes:     z.string().nullable().meta({ ...PII }),

  completed_at: z.string().nullable(),
  // created_at tiene default now() pero la columna admite null, así que el
  // contrato lo declara nullable en vez de prometer lo que la base no garantiza.
  created_at: z.string().nullable(),
})

export type Deal = z.infer<typeof DealSchema>
