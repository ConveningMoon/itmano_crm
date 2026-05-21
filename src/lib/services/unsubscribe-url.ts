import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'

const HMAC_BYTE_LENGTH = 32 // SHA-256 produces 32 bytes = 64 hex chars

function computeHmac(leadId: string): string {
  const secret = process.env.UNSUBSCRIBE_SECRET
  if (!secret) throw new Error('UNSUBSCRIBE_SECRET is not configured')
  return createHmac('sha256', secret).update(leadId).digest('hex')
}

export function generateUnsubscribeUrl(leadId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.itmano.com'
  return `${appUrl}/unsubscribe?lead=${leadId}&sig=${computeHmac(leadId)}`
}

export function verifyUnsubscribeSignature(leadId: string, sig: string): boolean {
  try {
    const provided = Buffer.from(sig, 'hex')
    if (provided.length !== HMAC_BYTE_LENGTH) return false
    const expected = Buffer.from(computeHmac(leadId), 'hex')
    return timingSafeEqual(expected, provided)
  } catch {
    return false
  }
}
