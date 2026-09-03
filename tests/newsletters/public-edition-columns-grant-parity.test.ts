import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { PUBLIC_EDITION_COLUMNS } from '@/lib/services/newsletter-integration-prompt'

// tests/newsletters/public-edition-columns-parity.test.ts cruza `shared.ts`
// contra el prompt de integración — las dos listas mantenidas a mano. Pero
// ninguna de las dos se cruza contra el GRANT real de la base: un tercer
// campo que alguien añada a ambas listas sin su
// `grant select (...) on newsletter_editions to anon` pasaría ese test igual
// y devolvería 401 en el select ENTERO en producción (los grants son por
// columna, no degradan a un resultado parcial) — el mismo fallo que ya
// sufrió `properties`.
//
// Este test lee los `grant select (...) on newsletter_editions to anon` de
// TODAS las migraciones (hoy la 105 y la 111, pero no están cableadas por
// número: una migración futura que sume o quite columnas del grant entra
// sola) y compara la unión contra `PUBLIC_EDITION_COLUMNS`. Sólo lee
// archivos — no toca la base — así que corre en `test:unit`.
const MIGRATIONS_DIR = path.resolve(__dirname, '../../supabase/migrations')

// Une `grant select (a, b) on newsletter_editions to anon;` en varias
// migraciones. `[\s\S]*?` (en vez de `.*`) porque el grant de la 105 rompe
// línea dentro del paréntesis.
const GRANT_RE = /grant\s+select\s*\(([\s\S]*?)\)\s*on\s+(?:public\.)?newsletter_editions\s+to\s+anon\s*;/gi

function grantedAnonColumns(): string[] {
  const archivos = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'))
  const columnas = new Set<string>()

  for (const archivo of archivos) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, archivo), 'utf8')
    for (const match of sql.matchAll(GRANT_RE)) {
      for (const columna of match[1].split(',')) {
        const limpia = columna.trim()
        if (limpia) columnas.add(limpia)
      }
    }
  }

  return [...columnas]
}

describe('paridad: PUBLIC_EDITION_COLUMNS contra el grant real de las migraciones', () => {
  it('el grant select(...) a anon de newsletter_editions concede exactamente estas columnas', () => {
    const concedidas = grantedAnonColumns().sort()
    const prometidas = [...PUBLIC_EDITION_COLUMNS].sort()
    expect(concedidas).toEqual(prometidas)
  })

  it('encuentra al menos un grant (guarda contra una regex que dejó de matchear)', () => {
    expect(grantedAnonColumns().length).toBeGreaterThan(0)
  })
})
