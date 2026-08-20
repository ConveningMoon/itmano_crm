// Siembra o actualiza las filas de studio_templates desde los archivos de
// src/lib/studio/templates/seed/. Es el camino de ida: los diseños se escriben
// como archivos mientras se portan y desde ahí entran a la base. Una vez
// dentro, la fuente de verdad es la fila y se edita en /studio/plantillas.
//
//   node scripts/seed-studio-templates.mjs            → sandbox (por defecto)
//   node scripts/seed-studio-templates.mjs produccion → producción (pregunta antes)
import { readFileSync, readdirSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { WebSocket } from 'ws'
import ts from 'typescript'

// `inferSlots` vive en src/lib/studio/templates/slots.ts (TypeScript) y este
// script es .mjs: no hay forma de importarlo directo. En vez de reescribir su
// lógica aquí —la segunda copia que la revisión final marcó como el problema
// real— la transpilamos al vuelo con el compilador de TypeScript (ya es
// devDependency) y la importamos como ESM desde un archivo temporal. El único
// import del archivo es `import type { SlotKey } from './types'`, que
// `transpileModule` elimina por completo al ser type-only, así que el
// resultado no tiene ninguna dependencia que resolver.
async function loadInferSlots() {
  const src = readFileSync(
    join(process.cwd(), 'src', 'lib', 'studio', 'templates', 'slots.ts'), 'utf8',
  )
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  })
  const tmpPath = join(tmpdir(), `studio-slots-${process.pid}-${Date.now()}.mjs`)
  writeFileSync(tmpPath, outputText)
  try {
    const mod = await import(`file://${tmpPath}`)
    return mod.inferSlots
  } finally {
    unlinkSync(tmpPath)
  }
}

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

const inferSlots = await loadInferSlots()

const db = createClient(url, keyServicio)
const raiz = join(process.cwd(), 'src', 'lib', 'studio', 'templates', 'seed')

for (const key of readdirSync(raiz)) {
  const dir = join(raiz, key)
  const metaPath = join(dir, 'meta.json')
  if (!existsSync(metaPath)) continue

  const meta = JSON.parse(readFileSync(metaPath, 'utf8'))
  const html = readFileSync(join(dir, 'template.html'), 'utf8')
  const css  = readFileSync(join(dir, 'template.css'), 'utf8')
  const { required, optional, idealPhotos } = inferSlots(html)

  const { error } = await db.from('studio_templates').upsert({
    key, label: meta.label, hint: meta.hint ?? '',
    recipes: meta.recipes, aspects: meta.aspects ?? ['4:5'],
    html, css,
    slots: { required, optional }, ideal_photos: idealPhotos,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'key' })

  if (error) {
    console.error(`✗ ${key}: ${error.message}`)
    process.exit(1)
  }
  console.log(`· ${key} — requeridos: ${required.join(', ') || 'ninguno'} · fotos ideales: ${idealPhotos}`)
}

console.log('Listo. Los slots y la miniatura de encaje ya quedaron sembrados; abre cada diseño en /studio/plantillas y pulsa Guardar sólo para generar su miniatura.')
