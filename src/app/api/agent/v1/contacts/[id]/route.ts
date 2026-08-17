import { defineRoute } from '@/lib/agent-api/handler'
import { getLead } from '@/lib/agent-api/queries/leads'
import { serializeContact } from '@/lib/agent-api/serializers/lead'

export const runtime = 'nodejs'
export const maxDuration = 30

export const GET = defineRoute({
  scope: 'read',
  kind:  'read',
  handler: async (ctx, _req, params) => serializeContact(await getLead(ctx, params.id)),
})
