import { defineRoute } from '@/lib/agent-api/handler'
import { parseLeadFilters, listLeads } from '@/lib/agent-api/queries/leads'
import { serializeContact } from '@/lib/agent-api/serializers/lead'

export const runtime = 'nodejs'
export const maxDuration = 30

// Proyección de persona sobre las MISMAS filas que /leads: mismos ids. Se
// reutiliza la query, no se duplica. En el OpenAPI va marcada
// `x-itmano-agent-tool: false` para que un planner no cuente dos veces a la
// misma persona al ver list_leads y list_contacts uno al lado del otro.
export const GET = defineRoute({
  scope: 'read',
  kind:  'read',
  handler: async (ctx, req) => {
    const filters = parseLeadFilters(new URL(req.url))
    const { rows, nextCursor } = await listLeads(ctx, filters)
    return {
      data:        rows.map(serializeContact),
      next_cursor: nextCursor,
    }
  },
})
