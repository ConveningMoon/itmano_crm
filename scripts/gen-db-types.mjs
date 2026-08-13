// Regenera src/lib/supabase/database.types.ts desde la base.
//
// Existe en vez de un `supabase gen types ... > archivo` suelto porque el CLI
// sobreescribe el archivo entero: la cabecera que explica para qué sirve se
// perdía en cada regeneración. Aquí se vuelve a poner siempre.

import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// Los dos proyectos Supabase. El esquema deberia ser el mismo en ambos, pero
// mientras una migracion vive solo en el sandbox (que es donde se estrena) los
// tipos hay que sacarlos de ahi o el archivo no reflejaria las columnas nuevas.
//
//   npm run types:db            -> produccion (por defecto)
//   npm run types:db:sandbox    -> sandbox
//   node scripts/gen-db-types.mjs <ref>   -> cualquier otro proyecto
const PROYECTOS = {
  prod:    'kvmjlrvlnhiarrqxulkr',
  sandbox: 'xpaixcowvyksgluazwzn',
}

const arg        = process.argv[2] ?? 'prod'
const PROJECT_ID = PROYECTOS[arg] ?? arg
const ETIQUETA   = PROYECTOS[arg] ? arg : `ref ${arg}`
const DESTINO    = 'src/lib/supabase/database.types.ts'

const CABECERA = `// GENERADO — no editar a mano. Se regenera con \`npm run types:db\`.
//
// Correrlo DESPUÉS de cada migración que cambie columnas: este archivo es el
// espejo del esquema real y lo que hace que \`columns()\` pueda validar los
// .select() (ver src/lib/supabase/columns.ts para el porqué).

`

// Con shell a propósito: en Windows el CLI se resuelve por `supabase.cmd`, que
// execFileSync no encuentra.
const salida = execSync(
  `supabase gen types typescript --project-id ${PROJECT_ID}`,
  { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
)

writeFileSync(DESTINO, CABECERA + salida, 'utf8')
console.log(`${DESTINO} regenerado desde ${ETIQUETA} (${salida.length} bytes del esquema)`)
