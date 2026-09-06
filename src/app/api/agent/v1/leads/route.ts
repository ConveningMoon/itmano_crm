import { defineRoute } from '@/lib/agent-api/handler'
import { parseLeadFilters, listLeads, getLead, getTenantCurrency } from '@/lib/agent-api/queries/leads'
import { createLead } from '@/lib/agent-api/queries/writes'
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

export const POST = defineRoute({
  scope: 'write',
  kind:  'write',
  handler: async (ctx, req) => {
    const id = await createLead(ctx, req)
    const [row, currency] = await Promise.all([getLead(ctx, id), getTenantCurrency(ctx)])
    return serializeLead(row, currency)
  },
})
