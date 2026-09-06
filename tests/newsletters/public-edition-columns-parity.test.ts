import { describe, it, expect } from 'vitest'
import { PUBLIC_EDITION_COLUMN_LIST } from '@/app/(hosted)/nl/[tenantSlug]/shared'
import { PUBLIC_EDITION_COLUMNS } from '@/lib/services/newsletter-integration-prompt'

// Las mismas 17 columnas públicas de `newsletter_editions` viven en DOS sitios
// mantenidos a mano: `shared.ts` (lo que la página pública de verdad lee) y
// `newsletter-integration-prompt.ts` (lo que el prompt le promete al
// desarrollador del cliente que puede pedir). Nada las fuerza a coincidir —
// esta rama ya pisó ese rastrillo dos veces. Este test es la fuerza: si una
// lista cambia sin la otra, falla aquí en vez de en producción con un 401 o
// una promesa que el servidor no cumple.
//
// No se fusionan en una sola constante compartida a propósito: `shared.ts`
// es 'server-only' (createAdminClient, columns() contra el esquema real),
// mientras que el prompt tiene que poder construirse sin servidor — acoplar
// los dos módulos para ahorrarse esta lista sería peor que mantenerla dos
// veces y vigilarla con un test.

describe('paridad de columnas públicas de newsletter_editions', () => {
  it('shared.ts y el prompt de integración piden exactamente las mismas columnas', () => {
    const enPagina = [...PUBLIC_EDITION_COLUMN_LIST].sort()
    const enPrompt = [...PUBLIC_EDITION_COLUMNS].sort()
    expect(enPagina).toEqual(enPrompt)
  })
})
