import { defineRoute } from '@/lib/agent-api/handler'
import { getLead, getTenantCurrency } from '@/lib/agent-api/queries/leads'
import { serializeLead } from '@/lib/agent-api/serializers/lead'

export const runtime = 'nodejs'
export const maxDuration = 30

export const GET = defineRoute({
  scope: 'read',
  kind:  'read',
  handler: async (ctx, _req, params) => {
    const [row, currency] = await Promise.all([
      getLead(ctx, params.id),
      getTenantCurrency(ctx),
    ])
    return serializeLead(row, currency)
  },
})
