import { defineRoute } from '@/lib/agent-api/handler'
import { createDraft } from '@/lib/agent-api/queries/writes'

export const runtime = 'nodejs'
export const maxDuration = 30

// CREA UN BORRADOR Y LO DEVUELVE. No envía. Ninguna ruta de esta superficie
// tiene acceso a un transporte de email, y un test recorre el árbol para
// verificar que no se importe ninguno.
export const POST = defineRoute({
  scope: 'write',
  kind:  'write',
  handler: async (ctx, req) => createDraft(ctx, req),
})
