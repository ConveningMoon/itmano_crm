import type { JWK } from '@supabase/supabase-js'

// Claves PÚBLICAS con las que Supabase firma las sesiones (el JWKS del
// proyecto). next.config.ts las descarga en el build y las escribe en el bundle
// como `process.env.SUPABASE_JWKS`.
//
// getClaims() verifica la firma del JWT en local, pero antes necesita la clave
// pública. Sin esto la descarga de Supabase en cada instancia nueva, y en las
// calientes cada 10 minutos (el TTL de su caché), antes de responder. El proxy
// corre en el borde de Vercel más cercano a quien navega, así que hay instancias
// en muchas regiones y cada una cruza hasta us-west-1: 160–230 ms medidos desde
// Europa en la primera página. Con las claves aquí no hay red.
//
// Rotar la clave en Supabase no rompe nada: si el token trae un `kid` que no
// está aquí, getClaims descarga el JWKS como antes. Revocar una clave sí pide un
// deploy para sacarla del bundle (docs/agents/environments.md); hasta entonces
// PostgREST ya rechaza esos tokens, así que no dan acceso a datos.

// Partes privadas de un JWK: `d` (EC/OKP/RSA), `p`…`qi` (RSA) y `k` (clave
// simétrica). Un JWKS público nunca las trae; si aparecen, esa clave no entra.
const MIEMBROS_PRIVADOS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k']

function esClavePublica(clave: unknown): clave is JWK {
  if (typeof clave !== 'object' || clave === null) return false
  const c = clave as Record<string, unknown>
  return typeof c.kid === 'string'
    && typeof c.kty === 'string'
    && c.kty !== 'oct'
    && MIEMBROS_PRIVADOS.every(m => !(m in c))
}

/** Las claves públicas de verificación de un JWKS; descarta todo lo demás. */
export function clavesPublicas(jwks: unknown): JWK[] {
  const keys = (jwks as { keys?: unknown } | null | undefined)?.keys
  return Array.isArray(keys) ? keys.filter(esClavePublica) : []
}

/** El JWKS del build en el formato de getClaims, o nada si no trae claves. */
export function leerJwks(valor: string | undefined): { keys: JWK[] } | undefined {
  if (!valor) return undefined
  try {
    const keys = clavesPublicas(JSON.parse(valor))
    return keys.length > 0 ? { keys } : undefined
  } catch {
    return undefined
  }
}

const jwks = leerJwks(process.env.SUPABASE_JWKS)

/**
 * Segundo argumento de `supabase.auth.getClaims()` en servidor. Sin claves en
 * el build queda vacío y getClaims descarga el JWKS como siempre.
 */
export const opcionesClaims: { jwks?: { keys: JWK[] } } = jwks ? { jwks } : {}
