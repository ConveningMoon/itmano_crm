import 'server-only'
import { z } from 'zod'
import { STAGES } from '@/lib/scoring/priority'
import { ApiError } from '../errors'
import { encodeCursor, decodeCursor, DEFAULT_LIMIT, MAX_LIMIT } from '../cursor'
import { PIPELINE } from '../schemas/deal'
import type { AgentContext } from '../auth'
import type { DealRow, OwnerLead } from '../serializers/deal'

// `leads!inner` permite filtrar por columnas del lead dueño manteniendo la
// paginación en la base. lead_id es NOT NULL con FK, así que el inner join no
// esconde ninguna fila.
const DEAL_SELECT =
  'id, lead_id, address, loan_type, closing_date, notes, completed_at, created_at, ' +
  'leads!inner(stage, budget_amount)'

export const DealFiltersSchema = z.object({
  lead_stage:       z.enum(STAGES).optional(),
  pipeline:         z.literal(PIPELINE).optional(),
  min_lead_budget:  z.coerce.number().nonnegative().optional(),
  close_before:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD').optional(),
  limit:            z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor:           z.string().min(1).optional(),
})

export type DealFilters = z.infer<typeof DealFiltersSchema>

export function parseDealFilters(url: URL): DealFilters {
  const parsed = DealFiltersSchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    throw new ApiError('invalid_arguments', 'Invalid query parameters', {
      issues: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data
}

function filterIdentity(f: DealFilters) {
  return {
    lead_stage: f.lead_stage ?? null,
    pipeline: f.pipeline ?? null,
    min_lead_budget: f.min_lead_budget ?? null,
    close_before: f.close_before ?? null,
  }
}

export interface DealWithOwner { row: DealRow; lead: OwnerLead | null }

/**
 * Separa el recurso embebido del propio. PostgREST devuelve el embed como
 * objeto o como array de uno según cómo infiera la cardinalidad, así que se
 * contemplan los dos casos.
 */
function split(raw: unknown): DealWithOwner {
  const { leads, ...row } = raw as Record<string, unknown> & { leads?: unknown }
  const lead = Array.isArray(leads) ? leads[0] : leads
  return {
    row:  row as unknown as DealRow,
    lead: (lead ?? null) as OwnerLead | null,
  }
}

export async function listDeals(
  ctx: AgentContext,
  filters: DealFilters,
): Promise<{ deals: DealWithOwner[]; nextCursor: string | null }> {
  let query = ctx.db
    .from('purchase_processes')
    .select(DEAL_SELECT)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(filters.limit + 1)

  if (filters.lead_stage)      query = query.eq('leads.stage', filters.lead_stage)
  if (filters.min_lead_budget !== undefined) {
    query = query.gte('leads.budget_amount', filters.min_lead_budget)
  }
  // Un proceso sin closing_date queda FUERA de close_before: no se puede afirmar
  // que cierre antes de una fecha si no tiene fecha. Documentado en el contrato.
  if (filters.close_before)    query = query.lt('closing_date', filters.close_before)

  if (filters.cursor) {
    const { created_at, id } = decodeCursor(filters.cursor, filterIdentity(filters))
    query = query.or(
      `created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`,
    )
  }

  const { data, error } = await query
  if (error) throw new ApiError('upstream_error', 'Deal query failed')

  const all = (data ?? []).map(split)
  const hasMore = all.length > filters.limit
  const page = hasMore ? all.slice(0, filters.limit) : all
  const last = page[page.length - 1]

  return {
    deals: page,
    // created_at admite null en la tabla (aunque tenga default): sin él no hay
    // posición desde la que seguir, así que se cierra la paginación.
    nextCursor: hasMore && last?.row.created_at
      ? encodeCursor(
          { created_at: last.row.created_at, id: last.row.id },
          filterIdentity(filters),
        )
      : null,
  }
}

export async function getDeal(ctx: AgentContext, id: string): Promise<DealWithOwner> {
  const { data, error } = await ctx.db
    .from('purchase_processes')
    .select(DEAL_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new ApiError('upstream_error', 'Deal query failed')
  if (!data) throw new ApiError('not_found', `No deal with id '${id}'`)

  return split(data)
}
