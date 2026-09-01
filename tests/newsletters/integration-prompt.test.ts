import { describe, it, expect } from 'vitest'
import {
  buildNewsletterIntegrationPrompt, PUBLIC_EDITION_COLUMNS,
} from '@/lib/services/newsletter-integration-prompt'

// El prompt ES el contrato: si dice algo que el servidor no hace, el
// desarrollador del cliente integra mal y la culpa parece suya. Lo que se
// prueba aquí son los puntos donde eso pasaría.

const BASE = {
  tenantName:  'A&J Real Estate Group',
  tenantId:    '11111111-1111-1111-1111-111111111111',
  publicId:    'chn_abc123def456',
  baseUrl:     'https://app.itmano.com',
  archiveUrl:  'https://news.itmano.com/aj-real-estate',
  supabaseUrl: 'https://proyecto.supabase.co',
  anonKey:     'anon-key-de-ejemplo',
  hasSequence: true,
}

describe('buildNewsletterIntegrationPrompt', () => {
  it('no menciona series', () => {
    expect(buildNewsletterIntegrationPrompt(BASE)).not.toMatch(/serie/i)
  })

  it('el endpoint usa el public_id de la newsletter del tenant', () => {
    expect(buildNewsletterIntegrationPrompt(BASE))
      .toContain('POST https://app.itmano.com/api/intake/chn_abc123def456/submit')
  })

  it('marca consent_text como obligatorio — sin él el intake rechaza', () => {
    const p = buildNewsletterIntegrationPrompt(BASE)
    expect(p).toContain('consent_text')
    expect(p).toContain('OBLIGATORIO')
  })

  it('enumera las columnas públicas y avisa de que select=* da 401', () => {
    const p = buildNewsletterIntegrationPrompt(BASE)
    // Los grants por columna de la migración 105 son la razón: pedir una
    // columna vedada tumba la consulta entera.
    for (const col of PUBLIC_EDITION_COLUMNS) expect(p).toContain(col)
    expect(p).toContain('401')
  })

  it('documenta category sin prometer que anon pueda leerla', () => {
    const p = buildNewsletterIntegrationPrompt(BASE)
    // category existe desde la 110, pero el grant real a `anon` (comprobado
    // contra el sandbox) sólo se la da a `authenticated` y `service_role`.
    // Documentarla como columna pública sería el mismo bug que este archivo
    // existe para evitar: un campo que el servidor rechaza con 401.
    expect(p).toContain('category')
    expect(PUBLIC_EDITION_COLUMNS as readonly string[]).not.toContain('category')
  })

  it('filtra la lectura pública por tenant_id, no por channel_id', () => {
    const p = buildNewsletterIntegrationPrompt(BASE)
    expect(p).toContain(`&tenant_id=eq.${BASE.tenantId}`)
    expect(p).not.toContain('channel_id=eq.')
  })

  it('no filtra nunca la service_role', () => {
    const p = buildNewsletterIntegrationPrompt(BASE)
    expect(p).toContain('NUNCA')
    expect(p.toLowerCase()).not.toContain('service_role_key')
  })

  it('dice si hay secuencia vinculada, y qué pasa si no', () => {
    expect(buildNewsletterIntegrationPrompt(BASE))
      .toContain('entra en la secuencia de seguimiento')
    expect(buildNewsletterIntegrationPrompt({ ...BASE, hasSequence: false }))
      .toContain('no tiene secuencia vinculada')
  })

  it('aguanta una newsletter sin archivo público', () => {
    const p = buildNewsletterIntegrationPrompt({ ...BASE, archiveUrl: null })
    expect(p).toContain('todavía no tiene archivo público')
    expect(p).not.toContain('null')
  })
})
