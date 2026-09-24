import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PUBLIC_OPEN_HOUSE_COLUMNS, buildOpenHouseIntegrationPrompt } from '@/lib/open-houses/integration-prompt'

// El prompt le dice a la web del cliente qué columnas pedir. Si promete una
// que `anon` no puede leer, la consulta entera falla con 401 en su sitio. Este
// test ata la lista del prompt al GRANT real de la migración.

function grantedAnonColumns(): string[] {
  const dir = path.resolve(__dirname, '../../supabase/migrations')
  const file = readdirSync(dir).find(f => f.endsWith('_open_houses.sql'))
  if (!file) throw new Error('No encontré la migración de open houses')
  const sql = readFileSync(path.join(dir, file), 'utf8')
  const m = /grant select \(([^)]+)\)\s+on public\.open_houses to anon/i.exec(sql)
  if (!m) throw new Error('No encontré el GRANT de columnas a anon')
  return m[1].split(',').map(s => s.trim()).filter(Boolean)
}

describe('prompt de integración de open houses', () => {
  it('pide exactamente las columnas que anon puede leer', () => {
    expect([...PUBLIC_OPEN_HOUSE_COLUMNS].sort()).toEqual(grantedAnonColumns().sort())
  })

  it('incluye la lectura, el RSVP y el calendario', () => {
    const prompt = buildOpenHouseIntegrationPrompt({
      tenantName: 'Equipo', tenantId: 't-1', baseUrl: 'https://app.example.com',
      supabaseUrl: 'https://ref.supabase.co', anonKey: 'anon', propertyId: 'p-1',
      propertyName: 'Casa', propertySlug: 'casa',
    })
    expect(prompt).toContain(`select=${PUBLIC_OPEN_HOUSE_COLUMNS.join(',')}`)
    expect(prompt).toContain('tenant_id=eq.t-1')
    expect(prompt).toContain('POST https://app.example.com/api/open-houses/<id>/rsvp')
    expect(prompt).toContain('https://app.example.com/api/open-houses/<id>/ics')
    // La advertencia menciona `select=*`; la consulta de ejemplo nunca lo usa.
    expect(prompt).not.toContain('?select=*')
  })
})
