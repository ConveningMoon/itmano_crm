import { defineRoute } from '@/lib/agent-api/handler'
import { parseDealFilters, listDeals } from '@/lib/agent-api/queries/deals'
import { getTenantCurrency } from '@/lib/agent-api/queries/leads'
import { serializeDeal } from '@/lib/agent-api/serializers/deal'

export const runtime = 'nodejs'
export const maxDuration = 30

export const GET = defineRoute({
  scope: 'read',
  kind:  'read',
  handler: async (ctx, req) => {
    const filters = parseDealFilters(new URL(req.url))
    const [{ deals, nextCursor }, currency] = await Promise.all([
      listDeals(ctx, filters),
      getTenantCurrency(ctx),
    ])
    return {
      data:        deals.map(d => serializeDeal(d.row, d.lead, currency)),
      next_cursor: nextCursor,
    }
  },
})
