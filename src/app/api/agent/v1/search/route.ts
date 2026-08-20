import { defineRoute } from '@/lib/agent-api/handler'
import { parseSearchParams, search } from '@/lib/agent-api/queries/search'

export const runtime = 'nodejs'
export const maxDuration = 30

// Transversal y deliberadamente pobre: localiza una entidad y devuelve tipo, id
// y etiqueta. Para el detalle se pide al endpoint correspondiente.
export const GET = defineRoute({
  scope: 'read',
  kind:  'read',
  handler: async (ctx, req) => ({
    data: await search(ctx, parseSearchParams(new URL(req.url))),
  }),
})
