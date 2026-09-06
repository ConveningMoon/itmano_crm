#!/usr/bin/env node
// Cruza, contra el build recién hecho, las rutas que USAN sharp con las que lo
// declaran en `outputFileTracingIncludes`.
//
// Por qué existe: sharp carga `@img/sharp-<plataforma>` con un require dinámico
// y ese paquete abre su libvips con dlopen. Un dlopen no es un require, así que
// el trazador de Next no puede verlo: el `.node` viaja al bundle y el `.so` se
// queda fuera. next.config.ts lo compensa listando a mano las rutas que llaman
// a sharp — y esa lista se mantenía "acordándose".
//
// No funcionó. Newsletters empezó a usar sharp por la portada con IA, nadie
// añadió sus cuatro rutas, y la sección entera murió en producción con el build
// en verde y el lockfile correcto:
//
//   Could not load the "sharp" module using the linux-x64 runtime
//   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
//
// En Windows y en macOS no se reproduce: ahí libvips va dentro del propio
// paquete de la plataforma, así que en local nunca falta nada. El fallo sólo
// existe en Linux, o sea sólo en producción.
//
// Este script convierte ese olvido en un build roto. Corre al final de
// `npm run build`, así que rompe también el build de Vercel: mejor un deploy en
// rojo que una sección en blanco para el cliente.

import { readFileSync, existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

const RAIZ       = path.resolve(import.meta.dirname, '..')
const APP        = path.join(RAIZ, '.next', 'server', 'app')
const CONFIG     = path.join(RAIZ, '.next', 'required-server-files.json')
// El paquete cuyo `.so` hay que arrastrar. Si una ruta lo declara, está cubierta.
const NATIVO     = '@img'

/** Todos los .nft.json bajo .next/server/app. */
async function manifiestos(dir) {
  const salida = []
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const completo = path.join(dir, entrada.name)
    if (entrada.isDirectory()) salida.push(...await manifiestos(completo))
    else if (entrada.name.endsWith('.nft.json')) salida.push(completo)
  }
  return salida
}

/**
 * Ruta de Next a partir del manifiesto: sin los grupos `(dashboard)` —que no
 * aparecen en la URL ni en las llaves del config— y sin el archivo final.
 */
function rutaDe(manifiesto) {
  const rel = path.relative(APP, manifiesto).split(path.sep).join('/')
  const sinArchivo = rel.replace(/\/(page|route)\.js\.nft\.json$/, '')
  const segmentos = sinArchivo.split('/').filter(s => s && !/^\(.*\)$/.test(s))
  return '/' + segmentos.join('/')
}

if (!existsSync(CONFIG) || !existsSync(APP)) {
  console.error('[sharp-tracing] No hay build en .next/. Corre `npm run build` primero.')
  process.exit(1)
}

const incluye = JSON.parse(readFileSync(CONFIG, 'utf8')).config.outputFileTracingIncludes ?? {}
const declaradas = new Set(
  Object.entries(incluye)
    .filter(([, patrones]) => patrones.some(p => p.includes(NATIVO)))
    .map(([ruta]) => ruta)
)

const usan = new Set()
for (const m of await manifiestos(APP)) {
  // El manifiesto lista rutas de archivo relativas; basta con que alguna
  // apunte dentro del paquete sharp para saber que esa función lo carga.
  if (readFileSync(m, 'utf8').includes('node_modules/sharp/')) usan.add(rutaDe(m))
}

const faltan = [...usan].filter(r => !declaradas.has(r)).sort()

if (faltan.length > 0) {
  console.error(
    '\n[sharp-tracing] Estas rutas cargan sharp y NO declaran sus binarios nativos:\n' +
    faltan.map(r => `    ${r}`).join('\n') +
    '\n\n  En Linux fallarán al primer uso con ERR_DLOPEN_FAILED (libvips-cpp.so),' +
    '\n  y en tu máquina no se reproduce. Añádelas a `outputFileTracingIncludes`' +
    '\n  en next.config.ts con SHARP_NATIVE.\n'
  )
  process.exit(1)
}

// Lo contrario NO es un error: una ruta puede declarar los binarios y dejar de
// usar sharp más tarde. Sobra peso en el bundle, no se rompe nada, y avisar de
// eso al mismo nivel entrenaría a ignorar este script.
console.log(`[sharp-tracing] ${usan.size} rutas usan sharp y todas declaran sus binarios.`)
