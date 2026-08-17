import 'server-only'
import { z } from 'zod'
import { columns } from '@/lib/supabase/columns'
import { STAGES } from '@/lib/scoring/priority'
import { ApiError } from '../errors'
import { encodeCursor, decodeCursor, DEFAULT_LIMIT, MAX_LIMIT } from '../cursor'
import type { AgentContext } from '../auth'
import type { LeadRow } from '../serializers/lead'

// La vista `leads_list` es la misma que usa la lista del CRM: ya trae banda de
// calidad y urgencia derivadas, así que no hay que recalcularlas aquí.
const LEAD_COLUMNS = columns('leads_list', [
  'id', 'first_name', 'last_name', 'email', 'phone', 'language', 'notes',
  'stage', 'quality_band', 'urgency', 'agent_id',
  'current_score', 'fit_score', 'engagement_score', 'manual_score',
  'budget_amount', 'created_at', 'updated_at',
])

export const LeadFiltersSchema = z.object({
  stage:         z.enum(STAGES).optional(),
  owner:         z.string().min(1).max(64).optional(),
  created_after: z.string().datetime({ offset: true }).optional(),
  q:             z.string().min(1).max(200).optional(),
  limit:         z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor:        z.string().min(1).optional(),
})

export type LeadFilters = z.infer<typeof LeadFiltersSchema>

/**
 * `status` se acepta como alias de entrada de `stage`: es el nombre que usa un
 * CRM genérico, y aquí la columna se llama `stage` desde la migración 082.
 */
export function parseLeadFilters(url: URL): LeadFilters {
  const raw = Object.fromEntries(url.searchParams)
  if (raw.status && !raw.stage) {
    raw.stage = raw.status
    delete raw.status
  }

  const parsed = LeadFiltersSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ApiError('invalid_arguments', 'Invalid query parameters', {
      issues: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data
}

/** Sólo lo que identifica la CONSULTA, sin la posición: es lo que sella el cursor. */
function filterIdentity(f: LeadFilters) {
  return { stage: f.stage ?? null, owner: f.owner ?? null, created_after: f.created_after ?? null, q: f.q ?? null }
}

export async function listLeads(
  ctx: AgentContext,
  filters: LeadFilters,
): Promise<{ rows: LeadRow[]; nextCursor: string | null }> {
  // Sin `.eq('tenant_id', …)` a propósito: el aislamiento lo aplica la RLS
  // sobre el JWT del bot. Añadirlo aquí escondería un fallo de policy.
  let query = ctx.db
    .from('leads_list')
    .select(LEAD_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(filters.limit + 1)

  if (filters.stage)         query = query.eq('stage', filters.stage)
  if (filters.owner)         query = query.eq('agent_id', filters.owner)
  if (filters.created_after) query = query.gt('created_at', filters.created_after)
  if (filters.q)             query = query.ilike('search_text', `%${filters.q}%`)

  if (filters.cursor) {
    const { created_at, id } = decodeCursor(filters.cursor, filterIdentity(filters))
    // Keyset sobre (created_at, id) descendente: estable aunque se inserten
    // filas entre páginas, que es lo que rompe el offset.
    query = query.or(
      `created_at.lt.${created_at},and(created_at.eq.${created_at},id.lt.${id})`,
    )
  }

  const { data, error } = await query
  if (error) throw new ApiError('upstream_error', 'Lead query failed')

  const rows = (data ?? []) as unknown as LeadRow[]
  const hasMore = rows.length > filters.limit
  const page = hasMore ? rows.slice(0, filters.limit) : rows

  const last = page[page.length - 1]
  return {
    rows: page,
    nextCursor: hasMore && last
      ? encodeCursor({ created_at: last.created_at, id: last.id }, filterIdentity(filters))
      : null,
  }
}

export async function getLead(ctx: AgentContext, id: string): Promise<LeadRow> {
  const { data, error } = await ctx.db
    .from('leads_list')
    .select(LEAD_COLUMNS)
    .eq('id', id)
    .maybeSingle()

  if (error) throw new ApiError('upstream_error', 'Lead query failed')

  // Un lead de otro tenant no es invisible por este `if`: es que la RLS no lo
  // devuelve. Por eso el 404 sale solo y nunca hace falta un 403.
  if (!data) throw new ApiError('not_found', `No lead with id '${id}'`)

  return data as unknown as LeadRow
}

/** La moneda del tenant, para serializar importes. */
export async function getTenantCurrency(ctx: AgentContext): Promise<string> {
  const { data } = await ctx.db.from('tenants').select('currency').maybeSingle()
  return (data?.currency as string | undefined) ?? 'USD'
}
