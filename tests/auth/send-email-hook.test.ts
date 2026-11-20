import { describe, expect, it } from 'vitest'
import { Webhook } from 'svix'
import {
  authCallbackLink, buildAuthEmails, hookSecretForSvix, otpTypeFor, type SendEmailHookPayload,
} from '@/lib/auth/send-email-hook'

// Send Email Hook de Supabase Auth (fase 3 del plan SaaS): los Magic Links
// salen por el CRM para que su cuota se mida. Si el enlace sale mal, nadie
// entra al CRM: estos casos son el contrato con /auth/callback.

const payload = (over: Partial<SendEmailHookPayload['email_data']> = {}, user: Partial<SendEmailHookPayload['user']> = {}): SendEmailHookPayload => ({
  user: { id: 'u-1', email: 'persona@example.com', ...user },
  email_data: {
    token: '123456',
    token_hash: 'hash-principal',
    redirect_to: 'https://app.itmano.com/auth/callback?next=%2Fleads',
    email_action_type: 'magiclink',
    site_url: 'https://app.itmano.com',
    token_new: '',
    token_hash_new: '',
    ...over,
  },
})

describe('enlace al callback', () => {
  it('conserva el next del login y añade token_hash y type', () => {
    const url = new URL(authCallbackLink('https://app.itmano.com/auth/callback?next=%2Fleads', 'https://app.itmano.com', 'h', 'email'))
    expect(url.origin + url.pathname).toBe('https://app.itmano.com/auth/callback')
    expect(url.searchParams.get('next')).toBe('/leads')
    expect(url.searchParams.get('token_hash')).toBe('h')
    expect(url.searchParams.get('type')).toBe('email')
  })

  it('un redirect a otra ruta pasa a ser el next del callback', () => {
    const url = new URL(authCallbackLink('http://localhost:3000/settings?tab=equipo', 'https://app.itmano.com', 'h', 'invite'))
    expect(url.origin + url.pathname).toBe('http://localhost:3000/auth/callback')
    expect(url.searchParams.get('next')).toBe('/settings?tab=equipo')
  })

  it('sin redirect usa el site_url y no inventa un next', () => {
    const url = new URL(authCallbackLink('', 'https://app.itmano.com', 'h', 'email'))
    expect(url.origin + url.pathname).toBe('https://app.itmano.com/auth/callback')
    expect(url.searchParams.has('next')).toBe(false)
  })

  it('cada acción usa el type que entiende verifyOtp', () => {
    expect(otpTypeFor('magiclink')).toBe('email')
    expect(otpTypeFor('signup')).toBe('email')
    expect(otpTypeFor('invite')).toBe('invite')
    expect(otpTypeFor('recovery')).toBe('recovery')
    expect(otpTypeFor('email_change')).toBe('email_change')
    expect(otpTypeFor('password_changed_notification')).toBeNull()
  })
})

describe('correos del hook', () => {
  it('un Magic Link: un correo al usuario con su enlace', () => {
    const [mail, ...rest] = buildAuthEmails(payload())
    expect(rest).toHaveLength(0)
    expect(mail.to).toBe('persona@example.com')
    expect(mail.subject).toContain('enlace de acceso')
    expect(mail.html).toContain('token_hash=hash-principal')
    expect(mail.text).toContain('token_hash=hash-principal')
    // El login no tiene dónde escribir el código: no se muestra.
    expect(mail.html).not.toContain('123456')
  })

  it('cambio de correo seguro: dos correos con los hashes cruzados de Supabase', () => {
    const mails = buildAuthEmails(payload(
      { email_action_type: 'email_change', token_hash: 'hash-para-nuevo', token_hash_new: 'hash-para-actual', token_new: '654321' },
      { new_email: 'nueva@example.com' },
    ))
    expect(mails.map(m => m.to)).toEqual(['persona@example.com', 'nueva@example.com'])
    expect(mails[0].html).toContain('token_hash=hash-para-actual')
    expect(mails[1].html).toContain('token_hash=hash-para-nuevo')
    expect(mails[0].html).toContain('type=email_change')
  })

  it('los avisos no activados no generan correo', () => {
    expect(buildAuthEmails(payload({ email_action_type: 'password_changed_notification' }))).toEqual([])
  })

  it('escapa lo que llega en el enlace', () => {
    const [mail] = buildAuthEmails(payload({ token_hash: 'a"><script>' }))
    expect(mail.html).not.toContain('"><script>')
  })
})

describe('firma del hook', () => {
  it('svix verifica la firma con el secreto tal como lo da Supabase (v1,whsec_…)', () => {
    const secret = 'v1,whsec_' + Buffer.from('secreto-de-prueba-de-32-bytes!!').toString('base64')
    const body = JSON.stringify(payload())
    const id = 'msg_1'
    const ts = new Date()
    const signer = new Webhook(hookSecretForSvix(secret))
    const signature = signer.sign(id, ts, body)
    const headers = { 'webhook-id': id, 'webhook-timestamp': String(Math.floor(ts.getTime() / 1000)), 'webhook-signature': signature }

    const verified = new Webhook(hookSecretForSvix(secret)).verify(body, headers) as SendEmailHookPayload
    expect(verified.user.id).toBe('u-1')
    expect(() => new Webhook(hookSecretForSvix(secret)).verify(body + ' ', headers)).toThrow()
  })
})
