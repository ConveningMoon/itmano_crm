import { defineRoute } from '@/lib/agent-api/handler'
import { createNote } from '@/lib/agent-api/queries/writes'

export const runtime = 'nodejs'
export const maxDuration = 30

// La nota se guarda como evento en lead_events con 0 puntos: queda en la
// bitácora del lead sin alterar su score.
export const POST = defineRoute({
  scope: 'write',
  kind:  'write',
  handler: async (ctx, req) => createNote(ctx, req, req.headers.get('idempotency-key')),
})
