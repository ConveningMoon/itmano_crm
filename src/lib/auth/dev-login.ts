import { timingSafeEqual } from 'node:crypto'

// Puerta de entrada para desarrollo. Existe porque el login del CRM es Magic
// Link puro: sin correo no se entra, y en desarrollo eso significa depender del
// buzón para ver cualquier pantalla.
//
// La decisión está aquí, separada de la ruta, para que sea comprobable sin
// levantar Next — el test que la acompaña es la única garantía de que ninguno de
// los cierres se cae en un refactor.
//
// El cierre que de verdad importa NO es "estoy en desarrollo" sino "estoy
// hablando con una base que no es la real": aunque el archivo llegue a
// producción y alguien conozca el secreto, ahí NEXT_PUBLIC_SUPABASE_URL apunta
// al proyecto de producción y la ruta se niega. El peor caso deja de ser
// "cualquiera entra al CRM de un cliente" y pasa a ser "alguien inicia sesión
// en una base de juguete".

export interface DevLoginEnv {
  nodeEnv:     string | undefined
  /** Cualquier valor indica que corre en Vercel — ahí nunca debe responder. */
  vercel:      string | undefined
  supabaseUrl: string | undefined
  /** Ref del ÚNICO proyecto Supabase contra el que se permite. Sin esto, nada. */
  allowedRef:  string | undefined
  secret:      string | undefined
}

export interface DevLoginRequest {
  secret: string | null
  email:  string | null
  /** Header Host tal cual llega (puede traer puerto). */
  host:   string | null
}

export type DevLoginDenial =
  | 'produccion'
  | 'vercel'
  | 'sin_secreto_configurado'
  | 'secreto_invalido'
  | 'sin_proyecto_permitido'
  | 'proyecto_no_permitido'
  | 'host_no_local'
  | 'sin_email'

export type DevLoginDecision =
  | { ok: true;  email: string }
  | { ok: false; reason: DevLoginDenial }

const HOSTS_LOCALES = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Compara en tiempo constante: dos secretos de largo distinto no son iguales. */
function secretoCoincide(recibido: string, esperado: string): boolean {
  const a = Buffer.from(recibido)
  const b = Buffer.from(esperado)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Ref del proyecto Supabase a partir de su URL: https://<ref>.supabase.co */
export function refDeSupabaseUrl(url: string | undefined): string | null {
  if (!url) return null
  try {
    const hostname = new URL(url).hostname
    const ref = hostname.split('.')[0]
    return ref.length > 0 ? ref : null
  } catch {
    return null
  }
}

function esHostLocal(host: string | null): boolean {
  if (!host) return false
  // Quita el puerto sin romper IPv6 entre corchetes.
  const sinPuerto = host.startsWith('[')
    ? host.slice(0, host.indexOf(']') + 1)
    : host.split(':')[0]
  return HOSTS_LOCALES.has(sinPuerto.toLowerCase())
}

/**
 * Cinco cierres, todos obligatorios. El orden es deliberado: primero lo que no
 * depende de la petición, para que un escaneo desde fuera no llegue siquiera a
 * comparar el secreto.
 */
export function evaluateDevLogin(env: DevLoginEnv, req: DevLoginRequest): DevLoginDecision {
  if (env.nodeEnv === 'production')  return { ok: false, reason: 'produccion' }
  if (env.vercel)                    return { ok: false, reason: 'vercel' }
  if (!env.secret)                   return { ok: false, reason: 'sin_secreto_configurado' }
  if (!req.secret || !secretoCoincide(req.secret, env.secret)) {
    return { ok: false, reason: 'secreto_invalido' }
  }
  if (!env.allowedRef)               return { ok: false, reason: 'sin_proyecto_permitido' }

  // Igualdad exacta del ref, no `includes`: un `includes` lo cumpliría cualquier
  // URL que contenga el ref permitido como subcadena.
  if (refDeSupabaseUrl(env.supabaseUrl) !== env.allowedRef) {
    return { ok: false, reason: 'proyecto_no_permitido' }
  }
  if (!esHostLocal(req.host))        return { ok: false, reason: 'host_no_local' }

  const email = req.email?.trim().toLowerCase()
  if (!email)                        return { ok: false, reason: 'sin_email' }

  return { ok: true, email }
}
