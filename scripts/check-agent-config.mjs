import { existsSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

const requiredFiles = [
  'AGENTS.md',
  'CLAUDE.md',
  '.mcp.json',
  '.codex/config.toml',
  'skills-lock.json',
  'docs/agents/README.md',
  'docs/agents/product.md',
  'docs/agents/environments.md',
  'docs/agents/architecture.md',
  'docs/agents/scoring.md',
  'docs/agents/domains.md',
  'docs/agents/workflow.md',
]

const errors = []

for (const path of requiredFiles) {
  if (!existsSync(path)) errors.push(`Falta ${path}`)
}

const agents = readFileSync('AGENTS.md', 'utf8')
if (Buffer.byteLength(agents, 'utf8') > 24 * 1024) {
  errors.push('AGENTS.md supera 24 KiB y se acerca al límite de contexto de Codex')
}

const claude = readFileSync('CLAUDE.md', 'utf8')
if (!claude.includes('@AGENTS.md')) {
  errors.push('CLAUDE.md debe importar @AGENTS.md')
}

const persistentMcp = [
  readFileSync('.mcp.json', 'utf8'),
  readFileSync('.codex/config.toml', 'utf8'),
].join('\n')

if (persistentMcp.includes('kvmjlrvlnhiarrqxulkr')) {
  errors.push('La configuración persistente de agentes no puede incluir producción')
}
if (!persistentMcp.includes('xpaixcowvyksgluazwzn')) {
  errors.push('Falta el project_ref del sandbox en la configuración persistente')
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
if (packageJson.volta?.node !== '24.20.0' || packageJson.volta?.npm !== '11.19.0') {
  errors.push('Las versiones Volta no coinciden con el contrato del repositorio')
}

const markdownFiles = ['README.md', 'AGENTS.md', 'CLAUDE.md', ...requiredFiles.filter((path) => path.endsWith('.md'))]
const linkPattern = /\[[^\]]*\]\(([^)]+)\)/g

for (const markdownFile of new Set(markdownFiles)) {
  const body = readFileSync(markdownFile, 'utf8')
  for (const match of body.matchAll(linkPattern)) {
    const rawTarget = match[1].trim().replace(/^<|>$/g, '')
    if (/^(https?:|mailto:|#)/.test(rawTarget)) continue

    const target = decodeURIComponent(rawTarget.split('#')[0])
    const absolute = isAbsolute(target) ? target : resolve(dirname(markdownFile), target)
    if (!existsSync(absolute)) errors.push(`${markdownFile}: enlace inexistente ${rawTarget}`)
  }
}

if (errors.length) {
  for (const error of errors) console.error(`Agent config: ${error}`)
  process.exit(1)
}

console.log('Agent config verificada')
