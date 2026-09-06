import 'server-only'
import { z } from 'zod'
import { ApiError } from '../errors'
import type { AgentContext } from '../auth'

export const SearchParamsSchema = z.object({
  q:     z.string().min(1).max(200),
  limit: z.coerce.number().int().min(1).max(25).default(10),
})

export type SearchParams = z.infer<typeof SearchParamsSchema>

export interface SearchHit {
  type:  'lead' | 'property' | 'deal'
  id:    string
  label: string
}

export function parseSearchParams(url: URL): SearchParams {
  const parsed = SearchParamsSchema.safeParse(Object.fromEntries(url.searchParams))
  if (!parsed.success) {
    throw new ApiError('invalid_arguments', 'Invalid query parameters', {
      issues: parsed.error.issues.map(i => ({ field: i.path.join('.'), message: i.message })),
    })
  }
  return parsed.data
}

// PostgREST interpreta `,` y `)` dentro de un `or(...)`: sin escapar, una
// búsqueda con coma rompería el filtro entero.
function escapar(termino: string): string {
  return termino.replace(/[,()\\]/g, ' ')
}

/**
 * Búsqueda transversal. Devuelve `{type, id, label}` — deliberadamente pobre:
 * sirve para localizar una entidad y luego pedirla por su endpoint, no para
 * sustituir a los listados.
 */
export async function search(ctx: AgentContext, params: SearchParams): Promise<SearchHit[]> {
  const patron = `%${escapar(params.q)}%`

  const [leads, propiedades, deals] = await Promise.all([
    ctx.db.from('leads').select('id, first_name, last_name, email')
      .ilike('search_text', patron).limit(params.limit),
    ctx.db.from('properties').select('id, name, address, city')
      .or(`name.ilike.${patron},address.ilike.${patron}`).limit(params.limit),
    ctx.db.from('purchase_processes').select('id, address')
      .ilike('address', patron).limit(params.limit),
  ])

  if (leads.error || propiedades.error || deals.error) {
    throw new ApiError('upstream_error', 'Search failed')
  }

  const hits: SearchHit[] = []

  for (const l of leads.data ?? []) {
    const r = l as { id: string; first_name: string; last_name: string | null; email: string }
    hits.push({
      type: 'lead', id: r.id,
      label: [`${r.first_name} ${r.last_name ?? ''}`.trim(), r.email].filter(Boolean).join(' · '),
    })
  }

  for (const p of propiedades.data ?? []) {
    const r = p as { id: string; name: string | null; address: string | null; city: string | null }
    hits.push({
      type: 'property', id: r.id,
      label: [r.name, r.address, r.city].filter(Boolean).join(' · ') || r.id,
    })
  }

  for (const d of deals.data ?? []) {
    const r = d as { id: string; address: string | null }
    hits.push({ type: 'deal', id: r.id, label: r.address ?? r.id })
  }

  return hits
}
