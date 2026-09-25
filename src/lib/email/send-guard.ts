// Guard de destinatarios fuera de producción.
//
// Local y los previews apuntan al Supabase sandbox, pero heredan la llave REAL
// de Resend: sin esto, probar un open house desde local le escribiría a
// cualquier email que haya en el sandbox. El guard decide, en el único punto
// por el que salen todos los correos (resendForAccount), si un envío va de
// verdad a Resend o se SIMULA.
//
// La regla es "falla cerrado": sólo se entrega de verdad cuando la app habla
// con el proyecto de PRODUCCIÓN. Cualquier otra cosa —sandbox, una URL
// ausente, un proyecto desconocido— restringe. Un entorno mal configurado
// simula en vez de enviar, que es el error barato.
//
// En modo restringido pasan a Resend sólo:
//   · las direcciones de prueba de Resend (@resend.dev: delivered@, bounced@,
//     complained@…), que reciben sin afectar la reputación del dominio y
//     disparan los webhooks reales;
//   · lo que diga EMAIL_TEST_ALLOWLIST: emails exactos o dominios "@ejemplo.com"
//     separados por comas.
// Todo lo demás se simula: no sale nada y el llamador recibe un id sintético,
// para que el flujo completo (email_sends, contadores, UI) se pueda probar.
//
// Módulo PURO: entra el env, salen decisiones. El test lo cubre sin red.

export const PRODUCTION_SUPABASE_REF = 'kvmjlrvlnhiarrqxulkr'
export const SIMULATED_ID_PREFIX     = 'simulated_'

const ALWAYS_ALLOWED_DOMAINS = ['@resend.dev']

export interface SendGuard {
  restricted: boolean
  allows(address: string): boolean
}

export function supabaseRefFromUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const host = new URL(url).hostname
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(host)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/** Extrae la dirección de "Nombre <correo@x.com>" o la devuelve tal cual. */
export function bareAddress(value: string): string {
  const m = /<([^>]+)>/.exec(value)
  return (m ? m[1] : value).trim().toLowerCase()
}

export function sendGuardFromEnv(env: Record<string, string | undefined>): SendGuard {
  const restricted = supabaseRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL) !== PRODUCTION_SUPABASE_REF
  const extra = (env.EMAIL_TEST_ALLOWLIST ?? '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  const domains = [...ALWAYS_ALLOWED_DOMAINS, ...extra.filter(s => s.startsWith('@'))]
  const exact   = new Set(extra.filter(s => !s.startsWith('@')))

  return {
    restricted,
    allows(address: string) {
      if (!restricted) return true
      const a = bareAddress(address)
      return exact.has(a) || domains.some(d => a.endsWith(d))
    },
  }
}

type AddressField = string | string[] | undefined

function addresses(field: AddressField): string[] {
  if (!field) return []
  return Array.isArray(field) ? field : [field]
}

/** Un correo pasa sólo si TODOS sus destinatarios (to, cc, bcc) pasan. */
export function emailAllowed(
  guard: SendGuard,
  email: { to?: AddressField; cc?: AddressField; bcc?: AddressField },
): boolean {
  if (!guard.restricted) return true
  const all = [...addresses(email.to), ...addresses(email.cc), ...addresses(email.bcc)]
  return all.length > 0 && all.every(a => guard.allows(a))
}

export function simulatedId(): string {
  return `${SIMULATED_ID_PREFIX}${globalThis.crypto.randomUUID()}`
}
