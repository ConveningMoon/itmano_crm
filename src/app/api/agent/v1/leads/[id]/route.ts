import { defineRoute } from '@/lib/agent-api/handler'
import { getLead, getTenantCurrency } from '@/lib/agent-api/queries/leads'
import { updateLead } from '@/lib/agent-api/queries/writes'
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

// Única ruta que mueve la etapa de un lead. No existe POST /deals/{id}/stage a
// propósito: dos rutas mutando el mismo campo dan dos vocabularios para el
// mismo hecho en el audit log.
export const PATCH = defineRoute({
  scope: 'write',
  kind:  'write',
  handler: async (ctx, req, params) => {
    await updateLead(ctx, params.id, req)
    const [row, currency] = await Promise.all([
      getLead(ctx, params.id),
      getTenantCurrency(ctx),
    ])
    return serializeLead(row, currency)
  },
})
