// Genera las miniaturas que muestra el selector de diseños.
//
// SE CORRE A MANO al añadir o cambiar un template, y la salida se commitea:
//   node scripts/gen-template-thumbs.mjs
//
// Reusa el test de templates para renderizar en vez de importar los .tsx desde
// aquí. Los templates son TypeScript con JSX y `server-only`, y montar un
// segundo pipeline de compilación solo para este script sería más frágil que
// apoyarse en el que ya funciona: el test acepta STUDIO_OUT_DIR y vuelca un PNG
// por template. Este script lo invoca y reduce esos PNG a miniaturas.

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import sharp from 'sharp'

const staging = mkdtempSync(join(tmpdir(), 'studio-thumbs-'))
const outDir  = join(process.cwd(), 'public', 'studio', 'templates')
mkdirSync(outDir, { recursive: true })

console.log('Renderizando los templates…')
const run = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vitest', 'run', 'tests/studio/templates.test.tsx'],
  { env: { ...process.env, STUDIO_OUT_DIR: staging }, stdio: 'inherit' },
)
if (run.status !== 0) {
  console.error('El render falló; no se generó ninguna miniatura.')
  rmSync(staging, { recursive: true, force: true })
  process.exit(1)
}

const pngs = readdirSync(staging).filter(f => f.endsWith('.png'))
if (pngs.length === 0) {
  console.error('El test no volcó ningún PNG. ¿Cambió STUDIO_OUT_DIR?')
  rmSync(staging, { recursive: true, force: true })
  process.exit(1)
}

for (const f of pngs) {
  const key = f.replace('.png', '')
  await sharp(readFileSync(join(staging, f)))
    // 800px: la tarjeta la muestra pequeña, pero el visor a pantalla completa
    // necesita resolución suficiente para juzgar el diseño. Un solo archivo
    // sirve a los dos usos.
    .resize(800)
    .webp({ quality: 80 })
    .toFile(join(outDir, `${key}.webp`))
  console.log(`  ${key}.webp`)
}

rmSync(staging, { recursive: true, force: true })
console.log(`\nListo. ${pngs.length} miniaturas en public/studio/templates/`)
