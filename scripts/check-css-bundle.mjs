#!/usr/bin/env node
// Comprueba, contra el build recién hecho, que el CSS compartido del dashboard
// (src/app/dashboard-ui.css) llegó al bundle.
//
// Por qué existe: el deploy del PR #293 salió en verde con el markup nuevo y el
// CSS de antes. Vercel restauró la caché de disco de Turbopack del deploy
// anterior y el bundle quedó sin una sola regla de dashboard-ui.css: tablas,
// botones y encabezados sin estilo en todo el CRM. Nada lo detecta solo — ni
// tsc, ni lint, ni el build —, porque un selector que no existe en el CSS no es
// un error, es una clase que no hace nada.
//
// next.config.ts apaga esa caché en builds (`turbopackFileSystemCacheForBuild`).
// Este script es la red de seguridad: si cualquier otra causa deja fuera esas
// reglas, el build se rompe en vez de desplegar una pantalla sin estilo. Corre
// al final de `npm run build`, así que rompe también el build de Vercel, y un
// deploy fallido deja la versión anterior sirviendo.
//
// Mira el RESULTADO (los .css de .next/static/chunks) y no la configuración.
// Sólo comprueba clases: son lo que el markup referencia por nombre, y lo que
// desaparece entero cuando el archivo no se compila.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const RAIZ   = path.resolve(import.meta.dirname, '..')
const FUENTE = path.join(RAIZ, 'src', 'app', 'dashboard-ui.css')
const CHUNKS = path.join(RAIZ, '.next', 'static', 'chunks')

if (!existsSync(CHUNKS)) {
  console.error('[css-bundle] No hay build en .next/. Corre `npm run build` primero.')
  process.exit(1)
}

/** Clases que declara el archivo fuente, sacadas de los selectores (no de los valores). */
function clasesDeclaradas(css) {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')
  // Todo lo que precede a una `{` es un selector o el preludio de un at-rule.
  const preludios = sinComentarios.match(/[^{}]+(?=\{)/g) ?? []
  const clases = new Set()
  for (const preludio of preludios) {
    if (preludio.trim().startsWith('@')) continue
    for (const m of preludio.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) clases.add(m[1])
  }
  return clases
}

const declaradas = clasesDeclaradas(readFileSync(FUENTE, 'utf8'))
if (declaradas.size === 0) {
  console.error(`[css-bundle] No se encontró ninguna clase en ${path.relative(RAIZ, FUENTE)}: el parser no está leyendo el archivo.`)
  process.exit(1)
}

const bundle = readdirSync(CHUNKS)
  .filter(f => f.endsWith('.css'))
  .map(f => readFileSync(path.join(CHUNKS, f), 'utf8'))
  .join('\n')

const faltan = [...declaradas].filter(c => !new RegExp(`\\.${c}(?![\\w-])`).test(bundle))

if (faltan.length > 0) {
  console.error(
    `\n[css-bundle] ${faltan.length} de ${declaradas.size} clases de dashboard-ui.css NO están en el CSS del build:\n` +
    faltan.sort().slice(0, 20).map(c => `    .${c}`).join('\n') +
    (faltan.length > 20 ? `\n    … y ${faltan.length - 20} más` : '') +
    '\n\n  El dashboard saldría sin estilo (tablas, botones y encabezados como texto plano).' +
    '\n  Suele ser caché de build obsoleta: borra `.next` y vuelve a compilar. En Vercel,' +
    '\n  redespliega sin "Use existing Build Cache".\n'
  )
  process.exit(1)
}

console.log(`[css-bundle] Las ${declaradas.size} clases de dashboard-ui.css están en el CSS del build.`)
