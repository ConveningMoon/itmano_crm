import { describe, it, expect } from 'vitest'
import { isLocalAiSpendBlocked, LOCAL_AI_SPEND_MESSAGE, LOCAL_AI_SPEND_ENV } from '@/lib/services/ai-guard'

// El guard existe por un gasto real: ~$8 el 26 de agosto de 2026 en unas 20
// generaciones de newsletter durante la depuración, invisibles para el tope
// mensual porque en local `ai_usage_events` se escribe en el sandbox.

describe('isLocalAiSpendBlocked', () => {
  it('nunca frena en producción, con o sin autorización', () => {
    expect(isLocalAiSpendBlocked({ NODE_ENV: 'production' })).toBe(false)
    expect(isLocalAiSpendBlocked({ NODE_ENV: 'production', ALLOW_LOCAL_AI_SPEND: '1' })).toBe(false)
  })

  // Vercel compila preview con NODE_ENV=production: frenar ahí apagaría la IA
  // en los deploys de rama, que es donde se revisa una feature antes de mergear.

  it('no frena en los tests: no llaman al SDK y romperían test:ai-limits', () => {
    expect(isLocalAiSpendBlocked({ NODE_ENV: 'test' })).toBe(false)
  })

  it('frena en desarrollo sin autorización explícita', () => {
    expect(isLocalAiSpendBlocked({ NODE_ENV: 'development' })).toBe(true)
  })

  it('frena también cuando NODE_ENV no está definido', () => {
    expect(isLocalAiSpendBlocked({})).toBe(true)
  })

  it('deja pasar en desarrollo con la autorización exacta', () => {
    expect(isLocalAiSpendBlocked({ NODE_ENV: 'development', ALLOW_LOCAL_AI_SPEND: '1' })).toBe(false)
  })

  // Sólo '1' autoriza. Un valor "parecido" no puede abrir el gasto por
  // accidente: la autorización tiene que ser deliberada.
  it('ignora valores que no sean exactamente 1', () => {
    for (const v of ['true', 'yes', '0', '', 'si']) {
      expect(isLocalAiSpendBlocked({ NODE_ENV: 'development', ALLOW_LOCAL_AI_SPEND: v })).toBe(true)
    }
  })
})

describe('LOCAL_AI_SPEND_MESSAGE', () => {
  it('nombra la variable que levanta el bloqueo', () => {
    expect(LOCAL_AI_SPEND_MESSAGE).toContain(LOCAL_AI_SPEND_ENV)
  })
})
