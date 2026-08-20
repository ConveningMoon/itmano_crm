import 'server-only'
import { createHash } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { ApiError } from './errors'

export type Scope = 'read' | 'write'

export interface AgentContext {
  tokenId:    string
  tenantId:   string
  tenantName: string
  scopes:     string[]
  expiresAt:  string
  /**
   * Cliente bajo RLS. TODO dato de negocio se lee y escribe por aquí: el
   * aislamiento por tenant lo aplica Postgres a partir del JWT del usuario-bot,
   * no un `.eq('tenant_id', …)` que un endpoint nuevo pueda olvidar.
   */
  db: SupabaseClient
}

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

// Prefijo mostrable: identifica el token en listados y revocaciones sin
// revelar la parte secreta.
export function tokenPrefix(raw: string): string {
  return raw.slice(0, 25)
}

function readBearer(req: Request): string {
  const header = req.headers.get('authorization') ?? ''
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (!match) {
    throw new ApiError('unauthorized', 'Missing or malformed Authorization header')
  }
  return match[1]
}

export async function authenticate(req: Request): Promise<AgentContext> {
  const raw   = readBearer(req)
  const admin = createAdminClient()

  const { data: row, error } = await admin
    .from('agent_tokens')
    .select('id, tenant_id, scopes, bot_user_id, expires_at, revoked_at, tenants(name)')
    .eq('token_hash', hashToken(raw))
    .maybeSingle()

  if (error) throw new ApiError('upstream_error', 'Token lookup failed')

  // Mismo mensaje para inexistente, revocado y vencido: no se filtra cuál.
  if (!row || row.revoked_at || new Date(row.expires_at as string) <= new Date()) {
    throw new ApiError('unauthorized', 'Invalid or expired token')
  }

  const { data: jwt, error: mintError } = await admin.rpc('agent_api_mint_jwt', {
    p_user_id:     row.bot_user_id,
    p_ttl_seconds: 900,
  })
  if (mintError || !jwt) throw new ApiError('upstream_error', 'Session mint failed')

  // Sello de uso best-effort: que falle no debe tumbar la petición.
  void admin.from('agent_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', row.id)
    .then(undefined, () => {})

  const db = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth:   { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${jwt as string}` } },
    },
  )

  return {
    tokenId:  row.id as string,
    tenantId: row.tenant_id as string,
    // reason: el join anidado de PostgREST no está tipado sin cliente tipado.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenantName: ((row as any).tenants?.name as string) ?? '',
    scopes:    row.scopes as string[],
    expiresAt: new Date(row.expires_at as string).toISOString(),
    db,
  }
}

// Los scopes son capa HTTP: la RLS permite escribir en el propio tenant, así
// que el modo solo-lectura se impone aquí, antes de tocar la base.
export function requireScope(ctx: Pick<AgentContext, 'scopes'>, scope: Scope): void {
  if (!ctx.scopes.includes(scope)) {
    throw new ApiError('insufficient_scope', `This token lacks the '${scope}' scope`)
  }
}
