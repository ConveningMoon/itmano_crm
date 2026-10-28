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
// Mira el RESULTADO (los .css emitidos) y no la configuración.
// Sólo comprueba clases: son lo que el markup referencia por nombre, y lo que
// desaparece entero cuando el archivo no se compila.

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const RAIZ   = path.resolve(import.meta.dirname, '..')
const FUENTE = path.join(RAIZ, 'src', 'app', 'dashboard-ui.css')

// La subcarpeta de los CSS depende de quién construya. En local salen en
// `.next/static/chunks`; en Vercel, el adaptador activa los estáticos inmutables
// (Next 16.3, `supportsImmutableAssets`) y salen en `.next/static/immutable/chunks`
// — de ahí las URLs `/_next/static/immutable/…` de producción. La primera versión
// miraba sólo `.next/static/chunks` y rompió el build de Vercel con "No hay
// build". Por eso se busca recursivo desde la raíz de estáticos y no se fija el
// nombre de la subcarpeta: sólo importan los .css. `.next/output/static` es la
// copia que escribe el adaptador de Vercel; se incluye por si algún día deja de
// existir la original.
const RAICES = [
  path.join(RAIZ, '.next', 'static'),
  path.join(RAIZ, '.next', 'output', 'static'),
  path.join(RAIZ, '.vercel', 'output', 'static'),
]

/** Todos los .css bajo `dir`. */
function cssBajo(dir) {
  const salida = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const completo = path.join(dir, e.name)
    if (e.isDirectory()) salida.push(...cssBajo(completo))
    else if (e.name.endsWith('.css')) salida.push(completo)
  }
  return salida
}

/** Entradas de `dir` hasta `prof` niveles, para el diagnóstico de abajo. */
function arbol(dir, prof, sangria = '    ') {
  if (prof === 0 || !existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => [
    `${sangria}${e.name}${e.isDirectory() ? '/' : ''}`,
    ...(e.isDirectory() ? arbol(path.join(dir, e.name), prof - 1, sangria + '  ') : []),
  ])
}

const archivosCss = RAICES.filter(existsSync).flatMap(cssBajo)
if (archivosCss.length === 0) {
  console.error(
    '\n[css-bundle] No encontré ningún .css del build. Busqué en:\n' +
    RAICES.map(r => `    ${path.relative(RAIZ, r)}${existsSync(r) ? '' : '  (no existe)'}`).join('\n') +
    '\n\n  Contenido de .next/ (2 niveles):\n' + (arbol(path.join(RAIZ, '.next'), 2).join('\n') || '    (no existe)') +
    '\n\n  Contenido de .vercel/output/ (3 niveles):\n' + (arbol(path.join(RAIZ, '.vercel', 'output'), 3).join('\n') || '    (no existe)') +
    '\n\n  Si el build es de Vercel, el adaptador cambió de sitio los estáticos: añade la' +
    '\n  ruta nueva a RAICES en scripts/check-css-bundle.mjs.\n'
  )
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

const bundle = archivosCss.map(f => readFileSync(f, 'utf8')).join('\n')

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

console.log(`[css-bundle] Las ${declaradas.size} clases de dashboard-ui.css están en el CSS del build (${archivosCss.length} archivos .css).`)
