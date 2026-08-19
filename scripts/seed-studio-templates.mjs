// Siembra o actualiza las filas de studio_templates desde los archivos de
// src/lib/studio/templates/seed/. Es el camino de ida: los diseños se escriben
// como archivos mientras se portan y desde ahí entran a la base. Una vez
// dentro, la fuente de verdad es la fila y se edita en /studio/plantillas.
//
//   node scripts/seed-studio-templates.mjs            → sandbox (por defecto)
//   node scripts/seed-studio-templates.mjs produccion → producción (pregunta antes)
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { WebSocket } from 'ws'

// supabase-js monta su cliente de Realtime al construirse, aunque este script
// no lo use, y ese cliente exige un WebSocket global — que Node trae nativo
// solo desde la 22. El repo sigue en la 21, así que se rellena con `ws`.
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket

const destino = process.argv[2] === 'produccion' ? '.env.local' : '.env.development.local'
config({ path: destino })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const keyServicio = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !keyServicio) {
  console.error(`Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en ${destino}`)
  process.exit(1)
}
console.log(`Sembrando en ${url}`)

const db = createClient(url, keyServicio)
const raiz = join(process.cwd(), 'src', 'lib', 'studio', 'templates', 'seed')

for (const key of readdirSync(raiz)) {
  const dir = join(raiz, key)
  const metaPath = join(dir, 'meta.json')
  if (!existsSync(metaPath)) continue

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  const html = readFileSync(join(dir, 'template.html'), 'utf8')
  const css  = readFileSync(join(dir, 'template.css'), 'utf8')

  const { error } = await db.from('studio_templates').upsert({
    key, label: meta.label, hint: meta.hint ?? '',
    recipes: meta.recipes, aspects: meta.aspects ?? ['4:5'],
    html, css, updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  if (error) {
    console.error(`✗ ${key}: ${error.message}`)
    process.exit(1)
  }
  console.log(`· ${key}`)
}

console.log('Listo. Abre cada diseño en /studio/plantillas y pulsa Guardar para inferir slots y generar su miniatura.')
