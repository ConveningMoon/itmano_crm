import { config as dotenvConfig } from 'dotenv'

for (const archivo of ['.env.test.local', '.env.development.local']) {
  dotenvConfig({ path: archivo, quiet: true })
}

const EXPECTED = {
  sandbox: 'xpaixcowvyksgluazwzn',
  production: 'kvmjlrvlnhiarrqxulkr',
}

function projectRefFromUrl(name, required) {
  const value = process.env[name]

  if (!value) {
    if (required) throw new Error(`${name} no está configurada`)
    return null
  }

  let hostname
  try {
    hostname = new URL(value).hostname
  } catch {
    throw new Error(`${name} no contiene una URL válida`)
  }

  const match = hostname.match(/^([a-z0-9]+)\.supabase\.co$/)
  if (!match) {
    throw new Error(`${name} debe usar el dominio directo <project_ref>.supabase.co`)
  }

  return match[1]
}

function requireProject(name, expectedRef, required = true) {
  const actualRef = projectRefFromUrl(name, required)
  if (actualRef && actualRef !== expectedRef) {
    throw new Error(`${name} apunta a un proyecto Supabase no autorizado para este job`)
  }
}

try {
  requireProject('NEXT_PUBLIC_SUPABASE_URL', EXPECTED.sandbox)

  const parityUrlSet = Boolean(process.env.PARITY_SUPABASE_URL)
  const parityKeySet = Boolean(process.env.PARITY_SUPABASE_SERVICE_ROLE_KEY)
  if (parityUrlSet !== parityKeySet) {
    throw new Error('PARITY_SUPABASE_URL y PARITY_SUPABASE_SERVICE_ROLE_KEY deben configurarse juntas')
  }
  requireProject('PARITY_SUPABASE_URL', EXPECTED.production, false)

  console.log('Supabase targets verificados: tests=sandbox; parity=production o desactivada')
} catch (error) {
  console.error(`Supabase target guard: ${error.message}`)
  process.exit(1)
}
