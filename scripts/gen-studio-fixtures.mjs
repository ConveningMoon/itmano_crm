// Genera las fotos neutras que usan el fixture de los tests de templates y,
// más adelante, las miniaturas del selector.
//
// Por qué generadas y no descargadas: es material que acaba en una página que ve
// el cliente. Una imagen de internet trae una licencia ajena, y una foto de A&J
// sería hardcodear datos de un tenant en el repo (regla dura #4). Generarlas una
// vez cuesta centavos y no tienen dueño.
//
// SE CORRE UNA VEZ. La salida se commitea; no es parte del build ni de los tests.
//   node scripts/gen-studio-fixtures.mjs
//
// Habla con la REST de Gemini directamente en vez de importar
// src/lib/carousels/gemini.ts porque este script es .mjs y aquel es TypeScript
// con `server-only`. Son veinte líneas y se ejecuta a mano una vez.

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { config } from 'dotenv'

config({ path: '.env.local' })

const KEY = process.env.GOOGLE_AI_API_KEY
if (!KEY) {
  console.error('Falta GOOGLE_AI_API_KEY en .env.local')
  process.exit(1)
}

const MODELS = [
  process.env.GEMINI_IMAGE_MODEL,
  'gemini-3.1-flash-image-preview',
  'gemini-3-pro-image',
  'gemini-2.5-flash-image',
].filter(Boolean)

// Casas genéricas de suburbio norteamericano, sin nada identificable. Las reglas
// duras son las mismas que usa el director de prompt del Estudio.
const HARD_RULES =
  ' No text, no letters, no numbers, no signage with words of any kind.' +
  ' No watermarks, no logos, no real brand names. No people, no identifiable faces.' +
  ' Photographic realism, natural daylight, no collage, no borders.'

const FIXTURES = [
  ['casa-fachada',   'Editorial architectural photograph of a modest two-story American suburban house with light blue siding, a covered front porch and a green lawn, mid-morning light, wide-angle 24mm, clean sky.'],
  ['casa-salon',     'Editorial interior photograph of a bright living room with a white brick fireplace, a light sectional sofa, a patterned rug and large windows with sheer curtains, warm afternoon light.'],
  ['casa-comedor',   'Editorial interior photograph of a dining room with a wooden table, upholstered chairs, a pendant chandelier and an open kitchen behind it, natural light from a large window.'],
  ['casa-atardecer', 'Editorial exterior photograph of a suburban house at blue hour, warm interior lights glowing through the windows against a deep blue sky, wet driveway reflecting the light.'],
]

async function generate(prompt) {
  let lastError = 'desconocido'
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt + HARD_RULES }] }],
          generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
        }),
      },
    )
    if (!res.ok) {
      lastError = `${model}: ${res.status} ${(await res.text()).slice(0, 160)}`
      continue
    }
    const json = await res.json()
    const parts = json?.candidates?.[0]?.content?.parts ?? []
    const inline = parts.find(p => p?.inlineData?.data)?.inlineData?.data
    if (inline) return { data: Buffer.from(inline, 'base64'), model }
    lastError = `${model}: respuesta sin imagen`
  }
  throw new Error(lastError)
}

const dir = join(process.cwd(), 'public', 'studio', 'fixtures')
mkdirSync(dir, { recursive: true })

for (const [name, prompt] of FIXTURES) {
  process.stdout.write(`${name}… `)
  const { data, model } = await generate(prompt)
  writeFileSync(join(dir, `${name}.png`), data)
  console.log(`ok (${model}, ${Math.round(data.length / 1024)} KB)`)
}

console.log(`\nListo. ${FIXTURES.length} imágenes en public/studio/fixtures/`)
