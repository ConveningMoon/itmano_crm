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

const claudeMcp = readFileSync('.mcp.json', 'utf8')
const codexMcp = readFileSync('.codex/config.toml', 'utf8')

// Sandbox y producción son MCP persistentes en ambos agentes (AGENTS.md), pero
// cada uno acotado por URL a su project_ref: un MCP de Supabase sin project_ref
// puede operar sobre cualquier proyecto de la organización.
for (const [agent, config] of [['Claude (.mcp.json)', claudeMcp], ['Codex (.codex/config.toml)', codexMcp]]) {
  if (!config.includes('project_ref=xpaixcowvyksgluazwzn')) {
    errors.push(`Falta el MCP sandbox acotado por project_ref en ${agent}`)
  }
  if (!config.includes('project_ref=kvmjlrvlnhiarrqxulkr')) {
    errors.push(`Falta el MCP de producción acotado por project_ref en ${agent}`)
  }
  const supabaseMcpUrls = config.match(/https:\/\/mcp\.supabase\.com\/mcp[^"\s]*/g) ?? []
  if (supabaseMcpUrls.some(url => !url.includes('project_ref='))) {
    errors.push(`${agent} declara un MCP de Supabase sin project_ref`)
  }
}

const requiredCodexMcpScopes = [
  'organizations:read',
  'projects:read',
  'projects:write',
  'database:write',
  'database:read',
  'analytics:read',
  'secrets:read',
  'edge_functions:read',
  'edge_functions:write',
  'environment:read',
  'environment:write',
  'storage:read',
  'storage:write',
]
for (const scope of requiredCodexMcpScopes) {
  if (!codexMcp.includes(`"${scope}"`)) {
    errors.push(`Falta el scope OAuth ${scope} del MCP sandbox de Codex`)
  }
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
if (packageJson.volta?.node !== '24.20.0' || packageJson.volta?.npm !== '11.19.0') {
  errors.push('Las versiones Volta no coinciden con el contrato del repositorio')
}

const expectedInstallScripts = ['esbuild@0.21.5', 'msw@2.14.6', 'unrs-resolver@1.11.1']
const allowedInstallScripts = Object.entries(packageJson.allowScripts ?? {})
  .filter(([, allowed]) => allowed === true)
  .map(([name]) => name)
  .sort()
if (allowedInstallScripts.join('\n') !== expectedInstallScripts.sort().join('\n')) {
  errors.push('La allowlist de scripts npm cambió; revisa cada paquete antes de aprobarlo')
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
