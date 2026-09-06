import { defineRoute } from '@/lib/agent-api/handler'

export const runtime = 'nodejs'
export const maxDuration = 30

// Verifica el cableado sin leer ningún dato de negocio: todo sale del contexto
// del token. Es el primer curl que debería funcionar en una integración nueva.
export const GET = defineRoute({
  scope: 'read',
  kind:  'meta',
  handler: async (ctx) => ({
    tenant:      { id: ctx.tenantId, name: ctx.tenantName },
    scopes:      ctx.scopes,
    api_version: 'v1',
    environment: process.env.AGENT_API_ENV ?? 'sandbox',
    token:       { expires_at: ctx.expiresAt },
  }),
})
