import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function recorrer(dir: string): string[] {
  return readdirSync(dir).flatMap(entrada => {
    const ruta = join(dir, entrada)
    return statSync(ruta).isDirectory() ? recorrer(ruta) : [ruta]
  })
}

const ARCHIVOS = [
  ...recorrer('src/app/api/agent'),
  ...recorrer('src/lib/agent-api'),
].filter(f => f.endsWith('.ts'))

/**
 * Código sin comentarios. Sin esto la guarda salta con un comentario que
 * EXPLICA por qué no se filtra a mano — un falso positivo que se repetiría cada
 * vez que alguien documente la decisión.
 */
function codigo(ruta: string): string {
  return readFileSync(ruta, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// Módulos que pueden mandar un email de verdad. Ninguno debe alcanzarse desde
// esta superficie: es la promesa central del contrato con CONDUIT.
const TRANSPORTES_DE_EMAIL = [
  'resend',
  'send-sequence-email',
  'send-one-off-email',
  'send-purchase-email',
  'enroll-lead-in-sequence',
  'process-sequence-run',
]

// Usan el cliente service-role legítimamente: resolver el token, mintear la
// sesión, contar el rate limit y guardar la idempotencia. Ninguno lee ni
// escribe datos de negocio.
const EXENTOS_DE_ADMIN = [
  'auth.ts', 'rate-limit.ts', 'idempotency.ts',
]

describe('guardas de la superficie de agente', () => {
  it('encuentra archivos que revisar', () => {
    expect(ARCHIVOS.length).toBeGreaterThan(10)
  })

  it('ningún archivo importa un transporte de email', () => {
    for (const archivo of ARCHIVOS) {
      const fuente = codigo(archivo)
      for (const modulo of TRANSPORTES_DE_EMAIL) {
        const importa = new RegExp(`(from|import)\\s*\\(?['"][^'"]*${modulo}`, 'i')
        expect(importa.test(fuente), `${archivo} importa ${modulo}`).toBe(false)
      }
    }
  })

  it('ninguna ruta exporta DELETE, en ninguna versión', () => {
    for (const archivo of ARCHIVOS.filter(f => f.endsWith('route.ts'))) {
      expect(codigo(archivo), archivo)
        .not.toMatch(/export\s+(const|async\s+function)\s+DELETE/)
    }
  })

  it('ninguna consulta de datos filtra por tenant_id a mano', () => {
    // Si un endpoint necesitara ese filtro, sería señal de que no confía en la
    // RLS — y entonces un fallo de policy quedaría oculto en vez de saltar.
    for (const archivo of ARCHIVOS) {
      if (EXENTOS_DE_ADMIN.some(e => archivo.endsWith(e))) continue
      expect(codigo(archivo), archivo).not.toContain("eq('tenant_id'")
    }
  })

  it('sólo los módulos exentos usan el cliente service-role', () => {
    for (const archivo of ARCHIVOS) {
      if (EXENTOS_DE_ADMIN.some(e => archivo.endsWith(e))) continue
      expect(codigo(archivo), archivo).not.toContain('createAdminClient')
    }
  })
})
