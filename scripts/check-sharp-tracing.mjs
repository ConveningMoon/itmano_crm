#!/usr/bin/env node
// Comprueba, contra el build recién hecho, que toda función que USA sharp lleva
// también la libvips nativa en su bundle.
//
// Por qué existe: sharp carga `@img/sharp-<plataforma>` con un require dinámico
// y ese paquete abre su libvips con dlopen. Un dlopen no es un require, así que
// el trazador de Next no puede verlo: el `.node` viaja al bundle y el `.so` se
// queda fuera. next.config.ts lo compensa listando a mano, en
// `outputFileTracingIncludes`, las rutas que llaman a sharp — y esa lista se
// mantenía "acordándose".
//
// No funcionó. Newsletters empezó a usar sharp por la portada con IA, nadie
// añadió sus cuatro rutas, y la sección entera murió en producción con el build
// en verde y el lockfile correcto:
//
//   Could not load the "sharp" module using the linux-x64 runtime
//   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
//
// Este script convierte ese olvido en un build roto. Corre al final de
// `npm run build`, así que rompe también el build de Vercel: mejor un deploy en
// rojo que una sección en blanco para el cliente.
//
// Mira el RESULTADO (el `.nft.json` de cada función, que es la lista de
// archivos que viaja con ella) y no la configuración. La primera versión leía
// `outputFileTracingIncludes` de `.next/required-server-files.json`, y eso dejó
// de servir con Vercel Pro: con Skew Protection activa, Vercel pasa
// `NEXT_DEPLOYMENT_ID` al build y Next (`experimental.runtimeServerDeploymentId`)
// escribe en ese archivo sólo la config de runtime, sin las opciones de build.
// El script veía `{}` y rompía todos los builds aunque los binarios sí iban en
// el bundle.
//
// En Linux, que es donde importa, libvips vive en un paquete aparte
// (`@img/sharp-libvips-linux-x64`) al que el trazado natural nunca llega: sólo
// aparece si la ruta lo declara. En Windows va dentro del paquete de la
// plataforma, así que en local este check es orientativo; el que manda es el
// del build de Vercel.

import { readFileSync, existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

const RAIZ = path.resolve(import.meta.dirname, '..')
const APP  = path.join(RAIZ, '.next', 'server', 'app')
// Un archivo de libvips dentro de @img: `.so` en Linux, `.dylib` en macOS,
// `.dll` en Windows. Su presencia en el trazado es la prueba de que la ruta
// declara SHARP_NATIVE.
const LIBVIPS = /node_modules\/@img\/[^"]*libvips/

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

if (!existsSync(APP)) {
  console.error('[sharp-tracing] No hay build en .next/. Corre `npm run build` primero.')
  process.exit(1)
}

const usan  = new Set()
const faltan = new Set()
for (const m of await manifiestos(APP)) {
  // El manifiesto lista rutas de archivo relativas; basta con que alguna
  // apunte dentro del paquete sharp para saber que esa función lo carga.
  const contenido = readFileSync(m, 'utf8')
  if (!contenido.includes('node_modules/sharp/')) continue
  usan.add(rutaDe(m))
  if (!LIBVIPS.test(contenido)) faltan.add(rutaDe(m))
}

if (faltan.size > 0) {
  console.error(
    '\n[sharp-tracing] Estas rutas cargan sharp y su bundle NO lleva libvips:\n' +
    [...faltan].sort().map(r => `    ${r}`).join('\n') +
    '\n\n  En Linux fallarán al primer uso con ERR_DLOPEN_FAILED (libvips-cpp.so),' +
    '\n  y en tu máquina no se reproduce. Añádelas a `outputFileTracingIncludes`' +
    '\n  en next.config.ts con SHARP_NATIVE.\n'
  )
  process.exit(1)
}

// Lo contrario NO es un error: una ruta puede declarar los binarios y dejar de
// usar sharp más tarde. Sobra peso en el bundle, no se rompe nada, y avisar de
// eso al mismo nivel entrenaría a ignorar este script.
console.log(`[sharp-tracing] ${usan.size} rutas usan sharp y todas llevan libvips en su bundle.`)
