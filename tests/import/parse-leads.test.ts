import { describe, it, expect } from 'vitest'
import { parseLeadRows, normalizeHeader } from '@/lib/import/parse-leads'

describe('normalizeHeader', () => {
  it('strips accents, case and punctuation', () => {
    expect(normalizeHeader('Teléfono')).toBe('telefono')
    expect(normalizeHeader('First Name')).toBe('firstname')
    expect(normalizeHeader('  E-mail ')).toBe('email')
  })
})

describe('parseLeadRows — column recognition', () => {
  it('recognizes Spanish + English headers (case/accents tolerant)', () => {
    const headers = ['Nombre', 'Apellido', 'Correo', 'Teléfono', 'Idioma', 'Estatus', 'Prestamista', 'Notas']
    const rows = [{ Nombre: 'Ana', Apellido: 'Ruiz', Correo: 'ana@x.com', 'Teléfono': '123', Idioma: 'es', Estatus: 'Nuevo', Prestamista: 'NFCU', Notas: 'hola' }]
    const r = parseLeadRows(rows, headers)
    expect(Object.keys(r.recognizedColumns).sort()).toEqual(
      ['email', 'firstName', 'language', 'lastName', 'lender', 'notes', 'phone', 'status'].sort()
    )
    expect(r.ignoredColumns).toEqual([])
    expect(r.rows[0]).toMatchObject({ firstName: 'Ana', lastName: 'Ruiz', email: 'ana@x.com', phone: '123', language: 'es', status: 'new', lender: 'NFCU', notes: 'hola' })
  })

  it('reports unrecognized columns as ignored', () => {
    const headers = ['email', 'nombre', 'puntaje', 'utm_source']
    const r = parseLeadRows([{ email: 'a@b.com', nombre: 'A', puntaje: '9', utm_source: 'ig' }], headers)
    expect(r.ignoredColumns).toEqual(['puntaje', 'utm_source'])
    expect(r.recognizedColumns.firstName).toBe('nombre')
  })

  it('preserves the lender (prestamista) column', () => {
    const r = parseLeadRows([{ email: 'a@b.com', prestamista: 'Navy Federal' }], ['email', 'prestamista'])
    expect(r.rows[0].lender).toBe('Navy Federal')
  })
})

describe('parseLeadRows — status mapping', () => {
  const headers = ['email', 'estatus']
  it('maps Nuevo/Cerrado case-insensitively', () => {
    const r = parseLeadRows(
      [{ email: 'a@b.com', estatus: 'nuevo' }, { email: 'c@d.com', estatus: 'CERRADO' }],
      headers,
    )
    expect(r.rows.map(x => x.status)).toEqual(['new', 'closed'])
    expect(r.statusDefaulted).toBe(0)
  })

  it('defaults missing/invalid status to closed and counts it', () => {
    const r = parseLeadRows(
      [{ email: 'a@b.com', estatus: '' }, { email: 'c@d.com', estatus: 'pendiente' }, { email: 'e@f.com' } as Record<string, string>],
      headers,
    )
    expect(r.rows.every(x => x.status === 'closed')).toBe(true)
    expect(r.statusDefaulted).toBe(3)
  })
})

describe('parseLeadRows — exclusions & dedup', () => {
  const headers = ['email', 'nombre']
  it('excludes rows without a valid email', () => {
    const r = parseLeadRows(
      [{ email: '', nombre: 'A' }, { email: 'not-an-email', nombre: 'B' }, { email: 'ok@x.com', nombre: 'C' }],
      headers,
    )
    expect(r.rows).toHaveLength(1)
    expect(r.excludedNoEmail).toBe(2)
  })

  it('dedups intra-file by email (case-insensitive), first wins', () => {
    const r = parseLeadRows(
      [{ email: 'dup@x.com', nombre: 'First' }, { email: 'DUP@x.com', nombre: 'Second' }, { email: 'other@x.com', nombre: 'C' }],
      headers,
    )
    expect(r.rows).toHaveLength(2)
    expect(r.excludedDuplicateInFile).toBe(1)
    expect(r.rows.find(x => x.email.toLowerCase() === 'dup@x.com')?.firstName).toBe('First')
  })

  it('defaults missing/invalid language to es, keeps valid', () => {
    const r = parseLeadRows(
      [{ email: 'a@x.com', idioma: 'fr' }, { email: 'b@x.com', idioma: 'en' }, { email: 'c@x.com' } as Record<string, string>],
      ['email', 'idioma'],
    )
    expect(r.rows.map(x => x.language)).toEqual(['es', 'en', 'es'])
  })
})
