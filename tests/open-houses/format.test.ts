import { describe, it, expect } from 'vitest'
import {
  buildIcs, buildOpenHouseMergeVars, formatOpenHouseDate, formatOpenHouseTime, googleCalendarUrl, OPEN_HOUSE_MERGE_TAGS,
} from '@/lib/open-houses/format'
import { defaultOpenHouseCopy } from '@/lib/open-houses/default-copy'
import { OPEN_HOUSE_EMAIL_KINDS, OPEN_HOUSE_LANGUAGES } from '@/lib/open-houses/model'
import { countdown } from '@/lib/open-houses/countdown'

const START = '2026-10-03T15:00:00Z' // 11:00 en Nueva York (EDT)
const END   = '2026-10-03T18:00:00Z'

describe('fecha y hora', () => {
  it('se escriben en la zona del lugar y en el idioma del lead', () => {
    expect(formatOpenHouseDate(START, 'America/New_York', 'es')).toMatch(/^Sábado, 3 de octubre de 2026$/)
    expect(formatOpenHouseDate(START, 'America/New_York', 'en')).toBe('Saturday, October 3, 2026')
    const time = formatOpenHouseTime(START, END, 'America/New_York', 'en')
    expect(time).toContain('11:00')
    expect(time).toContain('2:00')
    expect(time).toMatch(/\(EDT\)$/)
  })

  it('las variables del correo incluyen las del evento', () => {
    const vars = buildOpenHouseMergeVars({
      customerName: 'Ana', agentName: 'Luis', agentEmail: 'luis@example.com',
      propertyName: 'Casa Azul', propertyAddress: '1 Main St', startsAt: START, endsAt: END,
      timeZone: 'America/New_York', language: 'es', publicNotes: null,
      propertyUrl: 'https://p', rsvpUrl: 'https://r', calendarUrl: 'https://c',
    })
    for (const { tag } of OPEN_HOUSE_MERGE_TAGS) {
      expect(vars[tag.replace(/[{}]/g, '')]).toBeTypeOf('string')
    }
    expect(vars.open_house_notes).toBe('')
    // Dentro de una frase: "el sábado, 3 de octubre…", no "el Sábado…".
    expect(vars.open_house_date).toBe('sábado, 3 de octubre de 2026')
  })
})

describe('.ics', () => {
  const ev = {
    id: 'oh-1', revision: 3, title: 'Open house — Casa, con; comas', location: '1 Main St, Miami',
    description: 'Línea 1\nLínea 2', startsAt: START, endsAt: END, cancelled: false,
  }

  it('lleva UID estable, SEQUENCE según la revisión y horas en UTC', () => {
    const ics = buildIcs(ev, new Date('2026-09-01T00:00:00Z'))
    expect(ics).toContain('UID:open-house-oh-1@itmano.com')
    expect(ics).toContain('SEQUENCE:2')
    expect(ics).toContain('DTSTART:20261003T150000Z')
    expect(ics).toContain('STATUS:CONFIRMED')
    expect(ics).toContain('SUMMARY:Open house — Casa\\, con\\; comas')
    expect(ics).toContain('DESCRIPTION:Línea 1\\nLínea 2')
  })

  it('marca la cancelación y pliega líneas largas a 75 octetos', () => {
    const ics = buildIcs({ ...ev, cancelled: true, description: 'x'.repeat(300) })
    expect(ics).toContain('STATUS:CANCELLED')
    expect(ics).toContain('METHOD:CANCEL')
    for (const line of ics.split('\r\n')) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    }
  })

  it('arma el enlace de Google Calendar', () => {
    const url = new URL(googleCalendarUrl({ title: 'T', location: 'L', description: 'D', startsAt: START, endsAt: END }))
    expect(url.searchParams.get('dates')).toBe('20261003T150000Z/20261003T180000Z')
  })
})

describe('textos por defecto', () => {
  const known = new Set<string>(OPEN_HOUSE_MERGE_TAGS.map(t => t.tag))

  it('existen para cada tipo e idioma y sólo usan variables conocidas', () => {
    for (const kind of OPEN_HOUSE_EMAIL_KINDS) {
      for (const lang of OPEN_HOUSE_LANGUAGES) {
        const copy = defaultOpenHouseCopy(kind, lang)
        const used = [...`${copy.subject}\n${copy.body}`.matchAll(/\{\{\s*\w+\s*\}\}/g)].map(m => m[0])
        for (const tag of used) expect(known.has(tag), `${kind}/${lang}: ${tag}`).toBe(true)
      }
    }
  })

  it('no llevan enlaces: los botones de la plantilla los reemplazan', () => {
    for (const kind of OPEN_HOUSE_EMAIL_KINDS) {
      for (const lang of OPEN_HOUSE_LANGUAGES) {
        const { subject, body } = defaultOpenHouseCopy(kind, lang)
        expect(`${subject}\n${body}`).not.toMatch(/_url\}\}|https?:\/\//)
      }
    }
  })
})

describe('cuenta regresiva', () => {
  it('descompone lo que falta y cambia de fase al empezar y al terminar', () => {
    expect(countdown(START, END, new Date('2026-10-01T13:58:30Z'))).toEqual({ phase: 'upcoming', days: 2, hours: 1, minutes: 1, seconds: 30 })
    expect(countdown(START, END, new Date('2026-10-03T16:00:00Z')).phase).toBe('live')
    expect(countdown(START, END, new Date('2026-10-03T18:00:00Z')).phase).toBe('ended')
  })
})
