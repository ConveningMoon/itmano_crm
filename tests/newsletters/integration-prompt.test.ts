import { describe, it, expect } from 'vitest'
import {
  buildNewsletterIntegrationPrompt, PUBLIC_EDITION_COLUMNS,
} from '@/lib/services/newsletter-integration-prompt'

// El prompt ES el contrato: si dice algo que el servidor no hace, el
// desarrollador del cliente integra mal y la culpa parece suya. Lo que se
// prueba aquí son los tres puntos donde eso pasaría.

const BASE = {
  tenantName:  'A&J Real Estate Group',
  seriesName:  'Mercado de Hampton Roads',
  publicId:    'chn_abc123def456',
  baseUrl:     'https://app.itmano.com',
  archiveUrl:  'https://news.itmano.com/aj-real-estate/mercado-de-hampton-roads',
  supabaseUrl: 'https://proyecto.supabase.co',
  anonKey:     'anon-key-de-ejemplo',
  hasSequence: true,
}

describe('buildNewsletterIntegrationPrompt', () => {
  it('publica el endpoint de suscripción con el public_id de la serie', () => {
    const p = buildNewsletterIntegrationPrompt(BASE)
    expect(p).toContain('POST https://app.itmano.com/api/intake/chn_abc123def456/submit')
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

  it('aguanta una serie sin archivo público', () => {
    const p = buildNewsletterIntegrationPrompt({ ...BASE, archiveUrl: null })
    expect(p).toContain('todavía no tiene archivo público')
    expect(p).not.toContain('null')
  })
})
