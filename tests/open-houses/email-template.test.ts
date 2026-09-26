import { describe, it, expect } from 'vitest'
import { renderOpenHouseEmail, type OpenHouseEmailInput } from '@/lib/open-houses/email-template'
import { fromWithName, propertyEmailImages } from '@/lib/services/open-house-email'
import { inferTimeZoneFromAreas, businessTimeZone } from '@/lib/time-zones'

// La plantilla del correo de open house: botones en lugar de enlaces, las
// tres fotos y nada de texto sin escapar.

function input(over: Partial<OpenHouseEmailInput> = {}): OpenHouseEmailInput {
  return {
    kind: 'announcement', locale: 'es',
    subject: 'Open house en {{property_name}}',
    content: { v: 1, body: 'Hola {{customer_name}},\n\nTe espero.' },
    vars: { customer_name: 'Ana', agent_name: 'Luis', agent_email: 'luis@example.com', property_name: 'Casa Azul' },
    signature: 'Un abrazo,\n{{agent_name}}',
    unsubscribeUrl: 'https://app.example.com/unsubscribe?x=1',
    brand: { name: 'Equipo', logoUrl: null, accent: '#C9A96E' },
    property: { title: 'Casa Azul', address: '1 Main St, Norfolk, VA', images: ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg'] },
    event: { date: 'Sábado, 3 de octubre de 2026', time: '11:00 – 14:00 (GMT-4)', notes: 'Estaciona en la calle' },
    links: {
      rsvp: 'https://app.example.com/rsvp/tok', calendar: 'https://app.example.com/ics',
      googleCalendar: 'https://calendar.google.com/x', property: 'https://properties.example.com/casa', maps: 'https://maps/x',
    },
    ...over,
  }
}

describe('plantilla del correo de open house', () => {
  it('muestra las tres fotos, la tarjeta del evento y los botones', () => {
    const { subject, html } = renderOpenHouseEmail(input())
    expect(subject).toBe('Open house en Casa Azul')
    for (const src of ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg']) expect(html).toContain(src)
    expect(html).toContain('Sábado, 3 de octubre de 2026')
    expect(html).toContain('1 Main St, Norfolk, VA')
    expect(html).toContain('Estaciona en la calle')
    expect(html).toContain('>Confirmar asistencia</a>')
    expect(html).toContain('href="https://app.example.com/rsvp/tok"')
    expect(html).toContain('>Google Calendar</a>')
    expect(html).toContain('>Cómo llegar</a>')
    expect(html).toContain('Hola Ana,')
    expect(html).toContain('Un abrazo,<br/>Luis')
  })

  it('la cancelación no ofrece confirmar ni agendar', () => {
    const { html } = renderOpenHouseEmail(input({ kind: 'cancellation' }))
    expect(html).not.toContain('Confirmar asistencia')
    expect(html).not.toContain('Google Calendar')
    expect(html).toContain('Open house cancelado')
  })

  it('sin RSVP no hay botón de confirmar; el recordatorio dice "cambiar mi respuesta"', () => {
    expect(renderOpenHouseEmail(input({ links: { ...input().links, rsvp: null } })).html).not.toContain('Confirmar asistencia')
    expect(renderOpenHouseEmail(input({ kind: 'reminder' })).html).toContain('>Cambiar mi respuesta</a>')
  })

  it('escapa todo el texto que viene de la base', () => {
    const { html } = renderOpenHouseEmail(input({
      property: { ...input().property, title: '<script>alert(1)</script>' },
      brand: { name: 'A&B "Realty"', logoUrl: null, accent: 'javascript:alert(1)' },
    }))
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('A&amp;B &quot;Realty&quot;')
    // Un color inválido cae al de la marca por defecto, nunca se interpola.
    expect(html).not.toContain('javascript:')
  })
})

describe('fotos y remitente', () => {
  it('portada y las dos primeras de la galería, sin repetidas', () => {
    expect(propertyEmailImages('https://a', ['https://a', 'https://b', 'https://c', 'https://d'])).toEqual(['https://a', 'https://b', 'https://c'])
    expect(propertyEmailImages(null, ['javascript:x', 'https://b'])).toEqual(['https://b'])
  })

  it('pone el nombre del agente sobre el correo verificado del equipo', () => {
    expect(fromWithName('Luis Pérez', 'Equipo <hola@equipo.com>')).toBe('"Luis Pérez" <hola@equipo.com>')
    expect(fromWithName('Luis "<x>"', 'hola@equipo.com')).toBe('"Luis x" <hola@equipo.com>')
    expect(fromWithName('  ', 'Equipo <hola@equipo.com>')).toBe('Equipo <hola@equipo.com>')
  })
})

describe('zona horaria del negocio', () => {
  it('se deduce de la zona principal', () => {
    expect(inferTimeZoneFromAreas(['Virginia Beach', 'Norfolk'])).toBe('America/New_York')
    expect(inferTimeZoneFromAreas(['Houston'])).toBe('America/Chicago')
    expect(inferTimeZoneFromAreas(['Scottsdale, AZ'])).toBe('America/Phoenix')
    expect(inferTimeZoneFromAreas(['Ciudad de México'])).toBe('America/Mexico_City')
    expect(inferTimeZoneFromAreas(['Barcelona'])).toBe('Europe/Madrid')
    expect(inferTimeZoneFromAreas(['Suffolk, VA'])).toBe('America/New_York')
  })

  it('no confunde palabras del español con siglas de estados', () => {
    expect(inferTimeZoneFromAreas(['Playa de oro'])).toBeNull()
    expect(inferTimeZoneFromAreas(['la zona norte'])).toBeNull()
  })

  it('la configurada gana a la deducida', () => {
    expect(businessTimeZone({ timezone: 'America/Denver', primaryAreas: ['Miami'] })).toBe('America/Denver')
    expect(businessTimeZone({ timezone: null, primaryAreas: ['Miami'] })).toBe('America/New_York')
    expect(businessTimeZone({ timezone: null, primaryAreas: [] })).toBeNull()
  })
})
