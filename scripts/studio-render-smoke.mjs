// Comprueba que Chrome renderiza de verdad. No es un test: `test:unit` no
// levanta navegadores. Uso:
//   node scripts/studio-render-smoke.mjs
// Deja el PNG en studio-smoke.png y falla con código 1 si algo no cuadra.
import { writeFileSync } from 'node:fs'

const base = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
const secret = process.env.STUDIO_RENDER_SECRET
if (!secret) {
  console.error('Falta STUDIO_RENDER_SECRET en el entorno')
  process.exit(1)
}

const document = `<!doctype html><html class="sin-precio"><head><meta charset="utf-8">
<style>:root{--brand:#1B2A41;--w:1080px;--h:1350px}
*{box-sizing:border-box;margin:0}
body{width:var(--w);height:var(--h);background:var(--brand);display:flex;
align-items:center;justify-content:center}
h1{font-family:'Spectral';font-size:90px;color:#fff}
html.sin-precio h1::after{content:' · sin precio';font-size:40px}</style>
</head><body><h1>Hola</h1></body></html>`

const res = await fetch(`${base}/api/studio/render`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
  body: JSON.stringify({ document, width: 1080, height: 1350 }),
})

if (!res.ok) {
  console.error(`Falló con ${res.status}: ${await res.text()}`)
  process.exit(1)
}

const png = Buffer.from(await res.arrayBuffer())
writeFileSync('studio-smoke.png', png)
const esPng = png[0] === 0x89 && png.toString('ascii', 1, 4) === 'PNG'
console.log(`${png.length} bytes · PNG: ${esPng} · escrito en studio-smoke.png`)
process.exit(esPng ? 0 : 1)
