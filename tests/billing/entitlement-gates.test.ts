// Test estático: ninguna ruta nueva puede crear leads, publicar propiedades o
// mandar correo corporativo sin pasar por la compuerta del plan. Si falla, el
// arreglo es poner el gate (assertEntitlement / assertEmailQuota), no ampliar
// la lista blanca. Cada excepción de abajo lleva su motivo.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC = join(process.cwd(), 'src')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(name)) out.push(p)
  }
  return out
}

const files = walk(SRC).map(abs => ({
  path: relative(process.cwd(), abs).split(sep).join('/'),
  text: readFileSync(abs, 'utf8'),
}))

const GATE_ENTITLEMENT = /assertEntitlement/
const GATE_EMAIL = /assertEmailQuota|monthlyEmailAllowance|getFreshEmailEntitlements/

// Alta de leads: `.from('leads')` seguido (con espacios/saltos) de insert/upsert.
const LEAD_WRITE = /\.from\(\s*['"]leads['"]\s*\)\s*\.(insert|upsert)\(/
// Publicación: `published_to_web: true` o el valor que llega de un formulario
// (data/parsed/input/values/body/payload). Tipos, lecturas y `false` no cuentan.
const PUBLISH_WRITE = /published_to_web\s*:\s*(?:true|(?:data|parsed|input|values|body|payload))/
// Envío de correo con la API de Resend (directo o por lotes).
const EMAIL_SEND = /\.emails\.send\(|\.batch\.send\(|batchSend\(/

function offenders(
  match: RegExp,
  gate: RegExp,
  whitelist: Record<string, string>,
  skip: RegExp[] = [],
) {
  return files
    .filter(f => !skip.some(r => r.test(f.path)))
    .filter(f => match.test(f.text))
    .filter(f => !gate.test(f.text))
    .filter(f => !Object.keys(whitelist).some(w => f.path === w || (w.endsWith('/') && f.path.startsWith(w))))
    .map(f => f.path)
}

// Las claves terminadas en "/" son prefijos de carpeta.
const LEAD_WHITELIST: Record<string, string> = {
  // El intake de formularios y los webhooks nunca se bloquean: perder un lead
  // del cliente es peor que pasarse del límite (D4).
  'src/app/api/intake/': 'intake público: nunca bloquea',
  'src/app/api/webhooks/': 'webhooks entrantes (p. ej. respuestas de correo): nunca bloquean',
  // Servicios públicos compartidos por rutas de intake (/api/contact, webhooks,
  // páginas hospedadas): también son captura de leads del cliente.
  'src/lib/services/handle-contact-submission.ts': 'formularios de contacto públicos: nunca bloquean',
  'src/lib/services/open-house-rsvp.ts': 'RSVP público de open house: nunca bloquea',
}

const PUBLISH_WHITELIST: Record<string, string> = {
  // Escritores del sistema: restauran lo que la facturación despublicó tras
  // reactivar; no dejan que el tenant pase del tope.
  'src/lib/subscriptions/reactivate.ts': 'restaura publicaciones al reactivar, respetando el tope',
  'src/app/api/cron/billing-lifecycle/route.ts': 'ciclo de vida: sólo despublica (published_to_web: false)',
  'src/lib/subscriptions/over-cap-step.ts': 'paso de exceso: sólo despublica',
}

const EMAIL_WHITELIST: Record<string, string> = {
  // Correos de plataforma: no son envíos a leads del tenant ni cuentan contra su cuota.
  'src/app/api/auth/send-email/route.ts': 'hook de auth: Magic Link, correo de plataforma',
  'src/lib/subscriptions/notify-degradation.ts': 'aviso de plataforma al dueño del tenant',
  'src/lib/subscriptions/trial-notice.ts': 'aviso de plataforma sobre la prueba',
  // Envuelven la API de Resend; el gate vive en quien los llama.
  'src/lib/resend.ts': 'cliente y guardas de Resend (no envía por sí mismo)',
  'src/lib/email/quota-tracking.ts': 'instrumenta el cliente de Resend para contar',
  'src/lib/email/batch-send.ts': 'helper de lotes; lo llaman broadcast-dispatch y open-house-dispatch, ambos con gate',
  // El gate está en su único llamador.
  'src/lib/services/send-sequence-email.ts': 'gate en process-sequence-run.ts (único llamador)',
}

describe('compuertas del plan', () => {
  it('toda alta de leads pasa por assertEntitlement (salvo intake y webhooks)', () => {
    expect(offenders(LEAD_WRITE, GATE_ENTITLEMENT, LEAD_WHITELIST)).toEqual([])
  })

  it('toda escritura que publica una propiedad pasa por assertEntitlement', () => {
    expect(offenders(PUBLISH_WRITE, GATE_ENTITLEMENT, PUBLISH_WHITELIST)).toEqual([])
  })

  it('todo envío de correo corporativo pasa por la cuota de correos', () => {
    expect(offenders(EMAIL_SEND, GATE_EMAIL, EMAIL_WHITELIST)).toEqual([])
  })

  it('el llamador de send-sequence-email conserva su gate', () => {
    const caller = files.find(f => f.path === 'src/lib/services/process-sequence-run.ts')!
    expect(caller.text).toMatch(/send-sequence-email/)
    expect(caller.text).toMatch(GATE_EMAIL)
  })

  it('las excepciones de la lista blanca siguen existiendo', () => {
    const all = [LEAD_WHITELIST, PUBLISH_WHITELIST, EMAIL_WHITELIST].flatMap(o => Object.keys(o))
    for (const w of all) {
      expect(files.some(f => f.path === w || (w.endsWith('/') && f.path.startsWith(w))), w).toBe(true)
    }
  })
})
