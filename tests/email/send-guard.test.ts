import { describe, it, expect } from 'vitest'
import { sendGuardFromEnv, emailAllowed, bareAddress, PRODUCTION_SUPABASE_REF } from '@/lib/email/send-guard'

// Fuera de producción, local y los previews heredan la llave real de Resend.
// El guard es lo que impide que una prueba le escriba a un lead de verdad.

const PROD    = { NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_SUPABASE_REF}.supabase.co` }
const SANDBOX = { NEXT_PUBLIC_SUPABASE_URL: 'https://xpaixcowvyksgluazwzn.supabase.co' }

describe('send guard', () => {
  it('en producción no restringe nada', () => {
    const g = sendGuardFromEnv(PROD)
    expect(g.restricted).toBe(false)
    expect(g.allows('cliente@gmail.com')).toBe(true)
  })

  it('falla cerrado: sandbox, URL ausente o desconocida restringen', () => {
    expect(sendGuardFromEnv(SANDBOX).restricted).toBe(true)
    expect(sendGuardFromEnv({}).restricted).toBe(true)
    expect(sendGuardFromEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://otro.supabase.co' }).restricted).toBe(true)
    expect(sendGuardFromEnv({ NEXT_PUBLIC_SUPABASE_URL: 'no es url' }).restricted).toBe(true)
  })

  it('en modo restringido deja pasar las direcciones de prueba de Resend', () => {
    const g = sendGuardFromEnv(SANDBOX)
    expect(g.allows('delivered@resend.dev')).toBe(true)
    expect(g.allows('Prueba <bounced@resend.dev>')).toBe(true)
    expect(g.allows('cliente@gmail.com')).toBe(false)
    expect(g.allows('lead@example.com')).toBe(false)
  })

  it('respeta la allowlist por email exacto o por dominio', () => {
    const g = sendGuardFromEnv({ ...SANDBOX, EMAIL_TEST_ALLOWLIST: ' Dylan@Test.com , @mi-equipo.com ' })
    expect(g.allows('dylan@test.com')).toBe(true)
    expect(g.allows('otro@mi-equipo.com')).toBe(true)
    expect(g.allows('otro@test.com')).toBe(false)
  })

  it('un correo pasa sólo si pasan todos sus destinatarios', () => {
    const g = sendGuardFromEnv(SANDBOX)
    expect(emailAllowed(g, { to: 'delivered@resend.dev' })).toBe(true)
    expect(emailAllowed(g, { to: ['delivered@resend.dev', 'x@gmail.com'] })).toBe(false)
    expect(emailAllowed(g, { to: 'delivered@resend.dev', bcc: 'x@gmail.com' })).toBe(false)
    expect(emailAllowed(g, {})).toBe(false)
  })

  it('extrae la dirección de "Nombre <correo>"', () => {
    expect(bareAddress('Ana Pérez <Ana@Example.com>')).toBe('ana@example.com')
    expect(bareAddress(' ana@example.com ')).toBe('ana@example.com')
  })
})
