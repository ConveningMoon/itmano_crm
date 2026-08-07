import { describe, it, expect } from 'vitest'
import { buildIntegrationPrompt, type FitCatalogEntry } from '../../src/lib/services/integration-prompt'

const FIT_CATALOG: FitCatalogEntry[] = [
  { dimension: 'timeline',        matchValue: 'under_3_months',          label: 'Compra en <3 meses', points: 10 },
  { dimension: 'timeline',        matchValue: '3_6_months',              label: 'Compra en 3–6 meses', points: 10 },
  { dimension: 'financing',       matchValue: 'cash',                    label: 'Pago en efectivo', points: 10 },
  { dimension: 'budget_tier',     matchValue: 'premium',                 label: 'Presupuesto premium', points: 10 },
  { dimension: 'agent_status',    matchValue: 'sin_agente',              label: 'Sin agente', points: 10 },
  { dimension: 'sell_motivation', matchValue: 'alta',                    label: 'Motivación de venta alta', points: 10 },
  { dimension: 'listing_status',  matchValue: 'no_listado_sin_agente',   label: 'No listado, sin agente', points: 10 },
]

describe('buildIntegrationPrompt', () => {
  it('contact_form incluye ambos endpoints, el secret y advertencia de CORS', () => {
    const prompt = buildIntegrationPrompt({
      channelType: 'contact_form',
      channelName: 'Contáctanos — Home',
      publicId:    'chn_test123456',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      contactSecret: 'abc123secret',
      fitCatalog:  FIT_CATALOG,
    })
    expect(prompt).toContain('POST https://app.itmano.com/api/intake/chn_test123456/submit')
    expect(prompt).toContain('POST https://app.itmano.com/api/contact/chn_test123456/submit')
    expect(prompt).toContain('x-contact-secret: abc123secret')
    expect(prompt).toContain('Sin CORS')
    expect(prompt).toContain('A&J Real Estate Group')
    expect(prompt).toContain('¿Usas Webflow?')
    expect(prompt).toContain('POST https://app.itmano.com/api/webhooks/webflow/chn_test123456')
  })

  it('lead_magnet y event NO mencionan la alternativa autenticada ni la nota de Webflow', () => {
    const base = {
      channelName: 'Guía Compradores',
      publicId:    'chn_lm000000001',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      fitCatalog:  FIT_CATALOG,
    }
    const lm = buildIntegrationPrompt({ ...base, channelType: 'lead_magnet' })
    const ev = buildIntegrationPrompt({ ...base, channelType: 'event' })
    expect(lm).not.toContain('x-contact-secret')
    expect(ev).not.toContain('x-contact-secret')
    expect(lm).not.toContain('Webflow')
    expect(ev).not.toContain('Webflow')
    expect(lm).toContain('secuencia de email')
    expect(ev).toContain('event_submission')
  })

  it('agrupa el catálogo de fit por intención y omite dimensiones sin datos', () => {
    const prompt = buildIntegrationPrompt({
      channelType: 'lead_magnet',
      channelName: 'Guía Compradores',
      publicId:    'chn_lm000000001',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      fitCatalog:  FIT_CATALOG,
    })
    expect(prompt).toContain('timeline')
    expect(prompt).toContain('under_3_months | 3_6_months')
    expect(prompt).toContain('budget_tier')
    expect(prompt).toContain('sell_motivation')
    expect(prompt).toContain('listing_status')
  })

  it('con fitCatalog vacío, omite la sección de fit sin dejar un encabezado huérfano', () => {
    const prompt = buildIntegrationPrompt({
      channelType: 'event',
      channelName: 'Open House',
      publicId:    'chn_ev000000001',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      fitCatalog:  [],
    })
    expect(prompt).not.toContain('cómo el CRM reconoce cada respuesta')
  })

  it('siempre incluye el snippet de tracking de vistas con el publicId correcto', () => {
    const prompt = buildIntegrationPrompt({
      channelType: 'event',
      channelName: 'Open House',
      publicId:    'chn_ev000000001',
      tenantName:  'A&J Real Estate Group',
      baseUrl:     'https://app.itmano.com',
      fitCatalog:  [],
    })
    // El script se carga, no se escribe a mano: intake.js ya trae la huella del
    // visitante, las UTMs y el envio.
    expect(prompt).toContain('data-channel="chn_ev000000001"')
    // Y la forma RECOMENDADA es first-party. Cargarlo desde otro dominio lo
    // expone a los bloqueadores de rastreo, a CORS y al bot-check del otro
    // dominio — los tres fallan sin dejar rastro, y eso costo dias de diagnostico.
    expect(prompt).toContain('rewrites()')
    expect(prompt).toContain('/api/intake/:path*')
    expect(prompt).toContain('src="/intake.js"')
  })
})

import { adminClient, TENANT_A_ID } from '../rls/setup'
import { getFitCatalog } from '../../src/lib/services/integration-prompt'

describe('getFitCatalog', () => {
  it('lee las dimensiones de fit sembradas globalmente (migración 029)', async () => {
    const catalog = await getFitCatalog(adminClient, TENANT_A_ID)
    const dimensions = new Set(catalog.map(c => c.dimension))
    expect(dimensions).toContain('timeline')
    expect(dimensions).toContain('budget_tier')
    expect(dimensions).toContain('financing')
    expect(dimensions).toContain('agent_status')
    expect(dimensions).toContain('sell_motivation')
    expect(dimensions).toContain('listing_status')

    const timelineValues = catalog.filter(c => c.dimension === 'timeline').map(c => c.matchValue)
    expect(timelineValues).toContain('under_3_months')
  })
})
