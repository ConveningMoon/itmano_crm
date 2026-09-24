import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

// Token del enlace de RSVP que viaja en cada correo de open house: identifica
// (open house, lead) sin exponer nada más y sin poder fabricarse.
//
// Reusa UNSUBSCRIBE_SECRET con un prefijo de dominio ("open-house-rsvp:") en
// vez de otro secreto: es el mismo tipo de enlace firmado por lead, y un
// prefijo distinto impide que una firma de baja sirva como RSVP o al revés.
//
// El enlace abre una PÁGINA con botones; nunca registra una respuesta con un
// GET. Los escáneres de enlaces de los clientes de correo visitan cada URL
// antes que la persona, y un GET que confirmara asistencia la confirmaría por
// todos.

const SIG_HEX_LENGTH = 32

function sign(payload: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET is not configured')
  return createHmac('sha256', secret).update(`open-house-rsvp:${payload}`).digest('hex').slice(0, SIG_HEX_LENGTH)
}

export function createRsvpToken(openHouseId: string, leadId: string): string {
  const payload = `${openHouseId}:${leadId}`
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${sign(payload)}`
}

export function verifyRsvpToken(token: string): { openHouseId: string; leadId: string } | null {
  if (!token || token.length > 400) return null
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const encoded = token.slice(0, dot)
  const sig     = token.slice(dot + 1)
  if (!/^[0-9a-f]+$/.test(sig) || sig.length !== SIG_HEX_LENGTH) return null

  let payload: string
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const sep = payload.indexOf(':')
  if (sep <= 0) return null

  let expected: string
  try {
    expected = sign(payload)
  } catch {
    return null
  }
  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  return { openHouseId: payload.slice(0, sep), leadId: payload.slice(sep + 1) }
}
