/**
 * Emisión, listado y revocación de tokens de agente.
 *
 *   npm run agent:token -- --issue  --tenant tenant-conduit-demo --scopes read --name "CONDUIT"
 *   npm run agent:token -- --list   --tenant tenant-conduit-demo
 *   npm run agent:token -- --revoke itmano_agent_sbx_abcd
 *
 * El token se imprime UNA sola vez: sólo se guarda su sha256.
 * Aborta si el proyecto destino es el de producción.
 */
import { config as dotenv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import ws from 'ws'

for (const archivo of ['.env.test.local', '.env.development.local', '.env.local']) {
  dotenv({ path: archivo })
}

const PRODUCCION = 'kvmjlrvlnhiarrqxulkr'

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !svc) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')

  const ref = new URL(url).hostname.split('.')[0]
  if (ref === PRODUCCION) {
    throw new Error(`ABORTADO: ${ref} es PRODUCCIÓN. Los tokens de agente sólo se emiten en sandbox.`)
  }

  return createClient(url, svc, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  })
}

const hash = (t) => createHash('sha256').update(t).digest('hex')

/**
 * El bot es un usuario real de auth con su fila en user_profiles apuntando al
 * tenant. Eso es lo que hace que la RLS existente aplique sin que ningún
 * endpoint tenga que filtrar por tenant_id.
 */
async function asegurarBot(db, tenantId) {
  const email = `bot+${tenantId}@example.com`

  const { data: perfilExistente } = await db
    .from('user_profiles').select('id').eq('tenant_id', tenantId).eq('role', 'agent').maybeSingle()
  if (perfilExistente) return perfilExistente.id

  const { data: creado, error } = await db.rpc('rls_test_create_user', {
    p_email: email, p_password: randomBytes(24).toString('base64url'),
  })
  if (error) throw new Error(`No se pudo crear el usuario bot: ${error.message}`)

  const userId = creado

  // rol 'agent', nunca agent_owner ni super_admin: el bot no administra nada.
  const { error: errPerfil } = await db.from('user_profiles')
    .upsert({ id: userId, tenant_id: tenantId, role: 'agent' }, { onConflict: 'id' })
  if (errPerfil) throw new Error(`No se pudo crear el perfil del bot: ${errPerfil.message}`)

  return userId
}

export async function issueToken(opciones) {
  const db = adminClient()

  const { data: tenant } = await db.from('tenants').select('id').eq('id', opciones.tenantId).maybeSingle()
  if (!tenant) throw new Error(`No existe el tenant '${opciones.tenantId}'`)

  const botUserId = await asegurarBot(db, opciones.tenantId)

  const entorno = process.env.AGENT_API_ENV ?? 'sbx'
  const token   = `itmano_agent_${entorno}_${randomBytes(24).toString('base64url')}`
  const prefix  = token.slice(0, 25)
  const expiresAt = new Date(Date.now() + (opciones.ttlDays ?? 90) * 86400_000).toISOString()

  const { error } = await db.from('agent_tokens').insert({
    tenant_id: opciones.tenantId,
    name: opciones.name,
    token_prefix: prefix,
    token_hash: hash(token),
    scopes: opciones.scopes,
    bot_user_id: botUserId,
    expires_at: expiresAt,
  })
  if (error) throw new Error(`No se pudo guardar el token: ${error.message}`)

  return { token, prefix, expiresAt }
}

export async function revokeToken(prefix) {
  const db = adminClient()
  const { data, error } = await db.from('agent_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('token_prefix', prefix).is('revoked_at', null).select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function arg(nombre) {
  const i = process.argv.indexOf(`--${nombre}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

if (process.argv[1]?.includes('agent-token')) {
  const db = adminClient()

  if (process.argv.includes('--list')) {
    const tenantId = arg('tenant')
    let q = db.from('agent_tokens')
      .select('token_prefix, name, scopes, expires_at, revoked_at, last_used_at, tenant_id')
    if (tenantId) q = q.eq('tenant_id', tenantId)
    const { data } = await q
    console.table(data ?? [])
  } else if (process.argv.includes('--revoke')) {
    const prefix = arg('revoke') ?? process.argv[process.argv.indexOf('--revoke') + 1]
    const n = await revokeToken(prefix)
    console.log(n > 0 ? `Revocado: ${prefix}` : `Nada que revocar con prefijo ${prefix}`)
  } else if (process.argv.includes('--issue')) {
    const scopes = (arg('scopes') ?? 'read').split(',')
    const { token, prefix, expiresAt } = await issueToken({
      tenantId: arg('tenant') ?? 'tenant-conduit-demo',
      scopes,
      name: arg('name') ?? 'sin nombre',
    })
    console.log(`\nToken (se muestra UNA sola vez):\n\n  ${token}\n`)
    console.log(`  prefijo: ${prefix}`)
    console.log(`  scopes:  ${scopes.join(', ')}`)
    console.log(`  vence:   ${expiresAt}\n`)
  } else {
    console.log('Uso: --issue | --list | --revoke <prefijo>')
  }
}
