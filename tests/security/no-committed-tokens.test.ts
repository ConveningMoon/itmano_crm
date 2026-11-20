import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Ningún secreto real vive en un archivo versionado. Este test recorre lo que
// Git sigue (no node_modules ni archivos ignorados como .env.local) y busca la
// forma de los secretos que este proyecto maneja. Nació porque
// docs/agent-api/README.md llevó dos tokens de agente en claro.
//
// Los patrones exigen la longitud real del secreto: los ejemplos cortos de los
// tests (`itmano_agent_sbx_secretoLargo123`) y los marcadores de .env.example
// (`re_your-api-key-here`) no coinciden.
const SECRET_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'token de agente ITMANO', re: /itmano_agent_(?:sbx|prd|prod)_[A-Za-z0-9_-]{24,}/ },
  { name: 'llave de Anthropic',     re: /sk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{20,}/ },
  { name: 'llave de Resend',        re: /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/ },
  { name: 'secreto de webhook',     re: /\bwhsec_[A-Za-z0-9+/=]{24,}/ },
  { name: 'llave de Google AI',     re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'token de bot de Telegram', re: /\b\d{8,10}:AA[0-9A-Za-z_-]{33}\b/ },
  { name: 'JWT de Supabase',        re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.eyJpc3MiOiJzdXBhYmFzZSI[A-Za-z0-9_-]{20,}/ },
]

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return out.split('\0').filter(Boolean)
}

describe('secretos en archivos versionados', () => {
  it('ningún archivo seguido por Git contiene un secreto real', () => {
    const hallazgos: string[] = []
    for (const file of trackedFiles()) {
      let text: string
      try {
        const buf = readFileSync(file)
        if (buf.includes(0)) continue // binario
        text = buf.toString('utf8')
      } catch {
        continue // borrado en el árbol de trabajo pero aún en el índice
      }
      for (const { name, re } of SECRET_PATTERNS) {
        if (re.test(text)) hallazgos.push(`${file}: ${name}`)
      }
    }
    expect(hallazgos).toEqual([])
  })
})
