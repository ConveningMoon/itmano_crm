import { defineRoute } from '@/lib/agent-api/handler'
import { getDeal } from '@/lib/agent-api/queries/deals'
import { getTenantCurrency } from '@/lib/agent-api/queries/leads'
import { serializeDeal } from '@/lib/agent-api/serializers/deal'

export const runtime = 'nodejs'
export const maxDuration = 30

export const GET = defineRoute({
  scope: 'read',
  kind:  'read',
  handler: async (ctx, _req, params) => {
    const [{ row, lead }, currency] = await Promise.all([
      getDeal(ctx, params.id),
      getTenantCurrency(ctx),
    ])
    return serializeDeal(row, lead, currency)
  },
})
