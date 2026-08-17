import { defineRoute } from '@/lib/agent-api/handler'
import { parseLeadFilters, listLeads, getTenantCurrency } from '@/lib/agent-api/queries/leads'
import { serializeLead } from '@/lib/agent-api/serializers/lead'

export const runtime = 'nodejs'
export const maxDuration = 30

export const GET = defineRoute({
  scope: 'read',
  kind:  'read',
  handler: async (ctx, req) => {
    const filters = parseLeadFilters(new URL(req.url))
    const [{ rows, nextCursor }, currency] = await Promise.all([
      listLeads(ctx, filters),
      getTenantCurrency(ctx),
    ])
    return {
      data:        rows.map(r => serializeLead(r, currency)),
      next_cursor: nextCursor,
    }
  },
})
