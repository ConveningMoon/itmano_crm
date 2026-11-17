import { describe, it, expect } from 'vitest'
import { pageTitleFor, DEFAULT_PAGE_TITLE } from '@/lib/routing/page-titles'

// El topbar sólo conocía seis rutas exactas: Propiedades, Fuentes, Emails y
// todos los detalles mostraban "ITMANO CRM".

describe('pageTitleFor', () => {
  it('cubre todas las secciones del menú', () => {
    expect(pageTitleFor('/properties')).toBe('Propiedades')
    expect(pageTitleFor('/sources')).toBe('Fuentes')
    expect(pageTitleFor('/emails')).toBe('Emails')
    expect(pageTitleFor('/studio')).toBe('Estudio')
    expect(pageTitleFor('/soporte')).toBe('Soporte')
  })

  it('los detalles heredan el título de su sección', () => {
    expect(pageTitleFor('/leads/lead-123')).toBe('Leads')
    expect(pageTitleFor('/properties/abc/open-houses/x')).toBe('Propiedades')
  })

  it('gana la ruta más específica', () => {
    expect(pageTitleFor('/leads/new')).toBe('Registrar lead')
    expect(pageTitleFor('/emails/grupales/1')).toBe('Correo grupal')
    expect(pageTitleFor('/newsletters/nueva')).toBe('Nueva edición')
  })

  it('no confunde prefijos parciales', () => {
    expect(pageTitleFor('/leadsx')).toBe(DEFAULT_PAGE_TITLE)
    expect(pageTitleFor('/')).toBe(DEFAULT_PAGE_TITLE)
  })
})
