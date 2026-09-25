import { describe, it, expect, beforeAll } from 'vitest'

// El enlace de RSVP identifica a un lead sin pedirle nada: si se pudiera
// fabricar o reusar, cualquiera podría confirmar (o cancelar) por otro.

beforeAll(() => {
  process.env.UNSUBSCRIBE_SECRET = 'secreto-de-prueba'
})

const { createRsvpToken, verifyRsvpToken } = await import('@/lib/open-houses/rsvp-token')
const { generateUnsubscribeUrl } = await import('@/lib/services/unsubscribe-url')

const OH = '6f1c2b1e-8a3a-4c3f-9d7e-2f0b1c9a4e11'

describe('token de RSVP', () => {
  it('ida y vuelta devuelve el open house y el lead', () => {
    const token = createRsvpToken(OH, 'lead-123')
    expect(verifyRsvpToken(token)).toEqual({ openHouseId: OH, leadId: 'lead-123' })
  })

  it('rechaza un token alterado', () => {
    const token = createRsvpToken(OH, 'lead-123')
    const [payload, sig] = token.split('.')
    const otherPayload = Buffer.from(`${OH}:lead-999`).toString('base64url')
    expect(verifyRsvpToken(`${otherPayload}.${sig}`)).toBeNull()
    expect(verifyRsvpToken(`${payload}.${'0'.repeat(sig.length)}`)).toBeNull()
    expect(verifyRsvpToken('basura')).toBeNull()
  })

  it('una firma de baja no sirve como RSVP (dominios separados)', () => {
    const unsubSig = new URL(generateUnsubscribeUrl('lead-123')).searchParams.get('sig')!
    const payload = Buffer.from(`${OH}:lead-123`).toString('base64url')
    expect(verifyRsvpToken(`${payload}.${unsubSig.slice(0, 32)}`)).toBeNull()
  })
})
