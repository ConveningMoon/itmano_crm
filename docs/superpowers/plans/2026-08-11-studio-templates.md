# Estudio — templates de diseño · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nueve diseños listos para publicar (3 × casa abierta, nueva disponible, vendida) que el agente elige mirando, rellenados con las fotos y los datos que el CRM ya tiene, sin IA y sin costo.

**Architecture:** Un template es un módulo que declara **qué slots necesita** y **cómo se dibuja**. `satori` convierte JSX con flexbox a SVG y `sharp` lo pasa a PNG 1080×1350. Las fotos salen de `properties`, los textos del formulario por receta, la marca de `tenants` y `agents`. El modelo de imagen no participa.

**Tech Stack:** `satori` (nuevo) · sharp · Next.js 16.2 · React 19.2 · TypeScript strict · zod · Supabase · Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-11-studio-templates-design.md`](../specs/2026-08-11-studio-templates-design.md)

## Global Constraints

- **Rama:** `feat/studio-templates` (ya creada desde `main`, con el spec commiteado).
- **Idioma:** todo el texto de cara al usuario en español neutro latino. Sin emojis. Sentence case en labels.
- **Nunca hardcodear datos de tenant.** Logo, color, nombre y agentes salen de la base.
- **Nunca `any` sin `// reason:`.** TypeScript strict.
- **CSS variables en la UI del CRM**, nunca hex. Dentro de los templates sí hay hex — generan un PNG, no DOM.
- **Server Actions devuelven** `{ ok: true, data }` o `{ ok: false, error }`. Nunca lanzan.
- **Listas de columnas con `columns()`** de `src/lib/supabase/columns.ts`.
- **Commits** convencionales, cortos, en español. **Prohibido firmar como IA.** Nunca a `main`.
- **Por tarea:** `npm run lint` y `npx tsc --noEmit` deben pasar antes de commitear.
- **Formato único en esta entrega: 4:5 → 1080×1350.** Los templates declaran `aspects`; añadir otros es aditivo.

## Restricciones de satori (léelas antes de escribir un template)

Son la causa del 90% de los fallos al empezar:

- **Un elemento con más de un hijo necesita `display: 'flex'` explícito.** satori no asume `block`. Sin esto lanza en tiempo de render.
- **No hay `gap` en versiones viejas** — usa márgenes si falla.
- **Las imágenes van como data URI** (`data:image/jpeg;base64,…`). satori puede fetchear URLs, pero eso mete red en el render; nosotros ya descargamos las fotos.
- **Las fuentes se pasan como buffer** en las opciones, no por CSS.
- **No hay `text-overflow: ellipsis` fiable.** El texto se trunca en JS antes de pasarlo.
- **`position: 'absolute'`, `borderRadius`, `boxShadow` y `linear-gradient` sí funcionan.**

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `src/lib/studio/render/satori.ts` | `renderToPng(element, opts)` — el puente satori → sharp |
| `src/lib/studio/render/fonts.ts` | Buffers de fuente para satori |
| `src/lib/studio/templates/types.ts` | `StudioTemplate`, `TemplateProps`, tipos de slot |
| `src/lib/studio/templates/registry.ts` | Registro, búsqueda por receta, `templateFit()` |
| `src/lib/studio/templates/primitives.tsx` | Bloques compartidos: banda, tarjeta de foto, fila de specs, foto del agente, titular |
| `src/lib/studio/templates/<key>.tsx` | Un archivo por template (9) |
| `src/lib/studio/template-props.ts` | Arma `TemplateProps` desde formulario + marca + fotos |
| `src/lib/data/agent-photo.ts` | Lectura de la portada del agente |
| `scripts/gen-template-thumbs.mjs` | Genera las miniaturas commiteadas |
| `supabase/migrations/095_agent_cover_photo.sql` | Columnas nuevas |

---

## Task 1: Spike de satori

**Esta tarea existe para fallar barato.** Si satori no puede con el diseño de referencia, la salida es coordenadas a mano y menos templates — y hay que saberlo ahora, no con seis diseños a medias.

**Files:**
- Create: `src/lib/studio/render/fonts.ts`
- Create: `src/lib/studio/render/satori.ts`
- Create: `tests/studio/render.test.ts`
- Modify: `src/lib/carousels/fonts.ts` (exportar el buffer crudo)
- Modify: `package.json`

**Interfaces:**
- Produces: `renderToPng(element: React.ReactElement, opts: { width: number; height: number }): Promise<Buffer>`; `studioFonts(): SatoriFont[]`; `readFontBuffer(role: FontRole): Buffer`

- [ ] **Step 1: Instala satori**

```bash
npm i satori
```

- [ ] **Step 2: Exporta el buffer crudo de fuente**

En `src/lib/carousels/fonts.ts`, añade junto a `getFont` (reusa `resolveFontPath`, que ya existe en ese archivo):

```ts
const bufferCache = new Map<FontRole, Buffer>()

/**
 * El .ttf crudo. opentype.js lo parsea para el compositor de bandas; satori lo
 * quiere sin parsear. Misma resolución de ruta, así que vive aquí.
 */
export function readFontBuffer(role: FontRole): Buffer {
  const cached = bufferCache.get(role)
  if (cached) return cached
  const buf = readFileSync(resolveFontPath(FONT_FILES[role]))
  bufferCache.set(role, buf)
  return buf
}
```

- [ ] **Step 3: Escribe el puente a satori**

Crea `src/lib/studio/render/fonts.ts`:

```ts
import 'server-only'
import { readFontBuffer } from '@/lib/carousels/fonts'

// Las fuentes que satori inyecta. Los templates las referencian por `fontFamily`
// con estos nombres exactos — un nombre que no esté aquí cae a la primera y el
// diseño sale con la tipografía equivocada sin avisar.
export interface SatoriFont {
  name:   string
  data:   Buffer
  weight: 400 | 500 | 800
  style:  'normal'
}

export function studioFonts(): SatoriFont[] {
  return [
    { name: 'Spectral',  data: readFontBuffer('body'),     weight: 400, style: 'normal' },
    { name: 'Spectral',  data: readFontBuffer('subtitle'), weight: 500, style: 'normal' },
    { name: 'Spectral',  data: readFontBuffer('title'),    weight: 800, style: 'normal' },
    { name: 'Marcellus', data: readFontBuffer('label'),    weight: 400, style: 'normal' },
  ]
}
```

Crea `src/lib/studio/render/satori.ts`:

```ts
import 'server-only'
import satori from 'satori'
import sharp from 'sharp'
import { studioFonts } from './fonts'

// Puente satori → sharp. satori produce SVG a partir de JSX con flexbox; sharp
// lo rasteriza. Sin navegador, sin Chromium, y determinista.

export async function renderToPng(
  element: React.ReactElement,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const svg = await satori(element, {
    width:  opts.width,
    height: opts.height,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: el tipo Font de satori pide ArrayBuffer|Buffer y no exporta el union de forma usable
    fonts:  studioFonts() as any,
  })
  return sharp(Buffer.from(svg)).png().toBuffer()
}
```

- [ ] **Step 4: Escribe el test del spike**

Crea `tests/studio/render.test.ts`. Este test **es** el spike: replica los elementos difíciles del diseño de referencia (bandas apiladas, tarjetas superpuestas con sombra y radio, un elemento absoluto que cruza dos bandas, texto sobre color).

```tsx
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { renderToPng } from '@/lib/studio/render/satori'

const OUT = process.env.STUDIO_OUT_DIR

// Foto de relleno: un PNG plano como data URI, que es como los templates
// reciben las imágenes en producción.
async function fakePhoto(color: { r: number; g: number; b: number }): Promise<string> {
  const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: color } })
    .png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

describe('spike de satori', () => {
  it('renderiza los elementos difíciles del diseño de referencia', async () => {
    const hero  = await fakePhoto({ r: 120, g: 150, b: 190 })
    const thumb = await fakePhoto({ r: 200, g: 200, b: 195 })

    const el = (
      <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: '#FFFFFF', position: 'relative' }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- reason: satori no es DOM; renderiza a SVG */}
        <img src={hero} width={1080} height={700} style={{ objectFit: 'cover' }} alt="" />

        {/* Tres tarjetas superpuestas, con radio y sombra */}
        <div style={{ display: 'flex', position: 'absolute', top: 560, left: 60, gap: 20 }}>
          {[0, 1, 2].map(i => (
            // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
            <img key={i} src={thumb} width={300} height={220}
                 style={{ objectFit: 'cover', borderRadius: 12, boxShadow: '0 6px 18px rgba(0,0,0,0.25)' }} alt="" />
          ))}
        </div>

        {/* Bloque de titular */}
        <div style={{ display: 'flex', flexDirection: 'column', padding: '220px 60px 0' }}>
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 58, color: '#1B2A41' }}>
            Casa elegante y familiar
          </span>
        </div>

        {/* Dos bandas apiladas */}
        <div style={{ display: 'flex', position: 'absolute', bottom: 130, left: 0, width: 1080, height: 110, backgroundColor: '#1B2A41', alignItems: 'center', paddingLeft: 60 }}>
          <span style={{ fontFamily: 'Marcellus', fontSize: 28, color: '#FBF6EE' }}>1548 sqft · 3 hab · 2 baños</span>
        </div>
        <div style={{ display: 'flex', position: 'absolute', bottom: 0, left: 0, width: 1080, height: 130, backgroundColor: '#0F1826', alignItems: 'center', paddingLeft: 60 }}>
          <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 62, color: '#FFFFFF' }}>$274,400</span>
        </div>

        {/* Elemento absoluto que cruza las dos bandas */}
        <div style={{ display: 'flex', position: 'absolute', bottom: 0, right: 40, width: 260, height: 420, borderRadius: 130, backgroundColor: '#C9A96E' }} />
      </div>
    )

    const png = await renderToPng(el, { width: 1080, height: 1350 })
    const meta = await sharp(png).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1350)
    expect(meta.format).toBe('png')
    if (OUT) writeFileSync(`${OUT}/spike.png`, png)
  })
})
```

- [ ] **Step 5: Corre el test**

Run: `npx vitest run tests/studio/render.test.ts`
Expected: PASS.

Si falla con *"Expected <div> to have explicit display: flex"*, es la restricción de arriba: añade `display: 'flex'` al elemento señalado. Si falla por JSX en un `.test.ts`, renombra a `.test.tsx`.

- [ ] **Step 6: Míralo — este es el punto de la tarea**

```bash
mkdir -p .studio-qa && STUDIO_OUT_DIR=$PWD/.studio-qa npx vitest run tests/studio/render.test.ts
```

Abre `.studio-qa/spike.png` y comprueba: las tarjetas se superponen con sombra y esquinas redondeadas, las bandas están apiladas, el óvalo cruza las dos, el texto usa Spectral y Marcellus y no una fuente de sistema.

**Si algo de esto no sale, PARA y repórtalo antes de seguir.** El plan a partir de la Task 7 asume que satori puede con ello.

- [ ] **Step 7: Verifica y commitea**

```bash
rm -rf .studio-qa
npm run lint && npx tsc --noEmit
git add package.json package-lock.json src/lib/studio/render src/lib/carousels/fonts.ts tests/studio/render.test.ts
git commit -m "feat(studio): puente satori a png y spike del diseno de referencia"
```

---

## Task 2: Migración 095 y portada del agente (backend)

**Files:**
- Create: `supabase/migrations/095_agent_cover_photo.sql`
- Modify: `src/lib/supabase/database.types.ts` (generado)
- Modify: `src/app/(dashboard)/settings/actions.ts`
- Create: `tests/studio/agent-photo.test.ts`

**Interfaces:**
- Produces: `agents.cover_photo_url`, `agents.cover_photo_cutout`; `updateAgentCoverPhoto(formData): Promise<{ok:true;url:string;cutout:boolean}|{ok:false;error:string}>`; `removeAgentCoverPhoto(agentId)`

- [ ] **Step 1: Escribe la migración**

Crea `supabase/migrations/095_agent_cover_photo.sql`:

```sql
-- 095 · Portada del agente.
--
-- Es dato del AGENTE, no del Estudio: la sube él mismo en Ajustes → Agentes y
-- puede servir en otras superficies. El Estudio la usa en los templates cuando
-- el diseño tiene slot para ella, y siempre es opcional.
--
-- cover_photo_cutout guarda si el PNG traía transparencia real (sharp:
-- stats().isOpaque === false). Se persiste en vez de recalcularse porque el
-- compositor decide recorte-o-círculo en CADA render y no vamos a descargar y
-- analizar el archivo cada vez.

alter table agents
  add column if not exists cover_photo_url    text,
  add column if not exists cover_photo_cutout boolean not null default false;
```

- [ ] **Step 2: Aplica la migración**

Aplícala con el MCP de Supabase (`apply_migration`, name `095_agent_cover_photo`). **Si el MCP no está autorizado, detente y pide acceso** — no infieras el estado de la base.

- [ ] **Step 3: Regenera los tipos**

Run: `npm run types:db`
Expected: `agents` en `database.types.ts` incluye las dos columnas.

- [ ] **Step 4: Escribe el test de la detección de transparencia**

Crea `tests/studio/agent-photo.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { detectCutout, circleCrop } from '@/lib/studio/agent-photo'

async function opaquePng(): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 10, g: 20, b: 30 } } })
    .png().toBuffer()
}

async function transparentPng(): Promise<Buffer> {
  return sharp({ create: { width: 200, height: 200, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 0 } } })
    .png().toBuffer()
}

describe('portada del agente', () => {
  it('detecta transparencia real, no la mera presencia de canal alfa', async () => {
    expect(await detectCutout(await transparentPng())).toBe(true)
    expect(await detectCutout(await opaquePng())).toBe(false)
    // Un PNG con canal alfa pero totalmente opaco NO es un recorte.
    const alphaButOpaque = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 1, g: 2, b: 3, alpha: 1 } } })
      .png().toBuffer()
    expect(await detectCutout(alphaButOpaque)).toBe(false)
  })

  it('una imagen corrupta no lanza: degrada a "no es recorte"', async () => {
    expect(await detectCutout(Buffer.from('esto no es una imagen'))).toBe(false)
  })

  it('el círculo sale cuadrado, del tamaño pedido y con las esquinas transparentes', async () => {
    const out = await circleCrop(await opaquePng(), 240)
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(240)
    expect(meta.height).toBe(240)
    expect(meta.hasAlpha).toBe(true)
    // La esquina superior izquierda queda fuera del círculo → transparente.
    const corner = await sharp(out).extract({ left: 0, top: 0, width: 4, height: 4 }).raw().toBuffer()
    expect(corner[3]).toBe(0)
  })
})
```

- [ ] **Step 5: Corre el test y verifica que falla**

Run: `npx vitest run tests/studio/agent-photo.test.ts`
Expected: FAIL — `Cannot find module '@/lib/studio/agent-photo'`

- [ ] **Step 6: Implementa la detección y el círculo**

Crea `src/lib/studio/agent-photo.ts`:

```ts
import 'server-only'
import sharp from 'sharp'

// La portada del agente puede venir recortada (PNG con transparencia) o ser una
// foto normal. No se le pregunta al agente: sharp lo sabe.
//
// NO se recorta con IA. Nano Banana no recorta, REGENERA: devolvería una persona
// redibujada que se le parece. Para la cara de una agente real, con su nombre al
// lado, en material que publica con su marca, eso no es un recorte sino un
// retrato falso.

/** ¿Tiene transparencia REAL? Un canal alfa totalmente opaco no cuenta. */
export async function detectCutout(buffer: Buffer): Promise<boolean> {
  try {
    const { isOpaque } = await sharp(buffer).stats()
    return isOpaque === false
  } catch {
    // Imagen ilegible: se trata como foto normal y el círculo la salvará (o
    // fallará más adelante con un error visible). Nunca lanza aquí.
    return false
  }
}

/**
 * Recorte circular del tamaño pedido, encuadrado por entropía — que en un
 * retrato suele caer en la cara. Devuelve PNG con las esquinas transparentes.
 */
export async function circleCrop(buffer: Buffer, size: number): Promise<Buffer> {
  const square = await sharp(buffer)
    .resize(size, size, { fit: 'cover', position: 'attention' })
    .png()
    .toBuffer()

  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
       <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/>
     </svg>`,
  )
  return sharp(square).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}
```

- [ ] **Step 7: Corre el test y verifica que pasa**

Run: `npx vitest run tests/studio/agent-photo.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Escribe las actions de subida**

En `src/app/(dashboard)/settings/actions.ts`, después del bloque del logo del tenant, añade. **Copia el patrón del logo** (`updateTenantLogo`, líneas ~312-368): mismo bucket, mismo borrado del objeto anterior, misma limpieza si la fila no se actualiza.

```ts
// ─── Portada del agente (bucket tenant-assets) ────────────────────────────────
// Ruta: <tenant_id>/agents/<agent_id>/cover-<uuid>.<ext>. La escribe el propio
// agente (requireSelfOrManager), igual que su descripción.

const MAX_COVER_BYTES = 4 * 1024 * 1024
const COVER_EXT_BY_TYPE: Record<string, string> = {
  'image/png':  'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

export async function updateAgentCoverPhoto(
  formData: FormData,
): Promise<{ ok: true; url: string; cutout: boolean } | { ok: false; error: string }> {
  const agentId = formData.get('agentId')
  if (typeof agentId !== 'string' || !agentId) return { ok: false, error: 'Agente no válido' }

  const ctx = await getCurrentTenantContext()
  const denied = requireSelfOrManager(ctx, agentId)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const file = formData.get('file')
  if (!(file instanceof File)) return { ok: false, error: 'Archivo no válido' }
  if (!COVER_EXT_BY_TYPE[file.type]) return { ok: false, error: 'La foto debe ser PNG, JPG o WebP.' }
  if (file.size > MAX_COVER_BYTES) return { ok: false, error: 'La foto supera el tamaño máximo de 4 MB.' }

  const supabase = createAdminClient()
  const { data: agent } = await supabase
    .from('agents').select('id, cover_photo_url').eq('id', agentId).eq('tenant_id', tenantId).maybeSingle()
  if (!agent) return { ok: false, error: 'El agente no existe.' }

  const bytes  = Buffer.from(await file.arrayBuffer())
  const cutout = await detectCutout(bytes)
  const path   = `${tenantId}/agents/${agentId}/cover-${crypto.randomUUID()}.${COVER_EXT_BY_TYPE[file.type]}`

  const { error: uploadErr } = await supabase.storage
    .from(LOGO_BUCKET).upload(path, bytes, { contentType: file.type, upsert: false })
  if (uploadErr) return { ok: false, error: uploadErr.message }

  const { data: pub } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)

  const { error: updateErr } = await supabase
    .from('agents')
    .update({ cover_photo_url: pub.publicUrl, cover_photo_cutout: cutout })
    .eq('id', agentId).eq('tenant_id', tenantId)
  if (updateErr) {
    await supabase.storage.from(LOGO_BUCKET).remove([path])
    return { ok: false, error: updateErr.message }
  }

  await removeOldLogoObject(supabase, (agent as { cover_photo_url: string | null }).cover_photo_url)
  revalidatePath('/settings')
  return { ok: true, url: pub.publicUrl, cutout }
}

export async function removeAgentCoverPhoto(
  agentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getCurrentTenantContext()
  const denied = requireSelfOrManager(ctx, agentId)
  if (denied) return denied

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false, error: 'Selecciona un tenant desde el centro de control.' }

  const supabase = createAdminClient()
  const { data: agent } = await supabase
    .from('agents').select('cover_photo_url').eq('id', agentId).eq('tenant_id', tenantId).maybeSingle()

  const { error } = await supabase
    .from('agents')
    .update({ cover_photo_url: null, cover_photo_cutout: false })
    .eq('id', agentId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }

  await removeOldLogoObject(supabase, (agent as { cover_photo_url: string | null } | null)?.cover_photo_url ?? null)
  revalidatePath('/settings')
  return { ok: true }
}
```

Añade el import al principio del archivo: `import { detectCutout } from '@/lib/studio/agent-photo'`.

`removeOldLogoObject` y `LOGO_BUCKET` ya existen en ese archivo y sirven igual — el bucket es el mismo.

- [ ] **Step 9: Verifica y commitea**

```bash
npm run lint && npx tsc --noEmit && npm run test:unit
git add supabase/migrations/095_agent_cover_photo.sql src/lib/supabase/database.types.ts src/lib/studio/agent-photo.ts "src/app/(dashboard)/settings/actions.ts" tests/studio/agent-photo.test.ts
git commit -m "feat(studio): portada del agente con deteccion de transparencia"
```

---

## Task 3: Portada del agente en Ajustes (UI)

**Files:**
- Modify: `src/app/(dashboard)/settings/settings-client.tsx`

- [ ] **Step 1: Lee la fila de agente que ya existe**

Abre `settings-client.tsx` y localiza dónde el agente edita su descripción (busca `updateAgentDescription`). El control de la portada va **en esa misma fila**, porque es el mismo dueño y el mismo permiso.

- [ ] **Step 2: Añade el control**

Debajo del campo de descripción, dentro de la misma fila de agente:

```tsx
{/* Portada del agente: se usa en los diseños del Estudio y es opcional. */}
<div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
  {agent.cover_photo_url ? (
    /* eslint-disable-next-line @next/next/no-img-element -- reason: bucket público con host variable por entorno */
    <img src={agent.cover_photo_url} alt="" style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover' }} />
  ) : (
    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-overlay)' }} />
  )}
  <div style={{ flex: 1 }}>
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp"
      onChange={e => {
        const file = e.target.files?.[0]
        if (!file) return
        const data = new FormData()
        data.set('agentId', agent.id)
        data.set('file', file)
        startTransition(async () => {
          const r = await updateAgentCoverPhoto(data)
          if (!r.ok) setError(r.error)
        })
      }}
      style={{ fontSize: '12px', color: 'var(--text-muted)' }}
    />
    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.4 }}>
      Si subes un PNG con el fondo ya recortado, aparecerá de cuerpo completo sobre el diseño.
      Si no, se usará dentro de un círculo.
    </p>
  </div>
</div>
```

La recomendación está escrita **en términos de resultado**, no de formato: el agente no tiene que saber qué es un canal alfa.

- [ ] **Step 3: Verifica en el preview**

Levanta el dev server con `preview_start` (nunca `npm run dev` por Bash), entra a `/settings` → Agentes y comprueba que el control aparece en la fila del agente y que el texto se lee. **La subida real necesita sesión**; si no puedes autenticarte, dilo en el reporte en vez de darlo por verificado.

- [ ] **Step 4: Verifica y commitea**

```bash
npm run lint && npx tsc --noEmit
git add "src/app/(dashboard)/settings/settings-client.tsx"
git commit -m "feat(studio): subir la portada del agente desde ajustes"
```

---

## Task 4: Contrato de templates y encaje

**Files:**
- Create: `src/lib/studio/templates/types.ts`
- Create: `src/lib/studio/templates/registry.ts`
- Create: `tests/studio/template-fit.test.ts`

**Interfaces:**
- Produces: `StudioTemplate`, `TemplateProps`, `SlotKey`; `TEMPLATES`, `templatesForRecipe(recipe)`, `findTemplate(key)`, `templateFit(template, data): FitReport`

- [ ] **Step 1: Escribe el test que falla**

Crea `tests/studio/template-fit.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { templateFit, templatesForRecipe, findTemplate, TEMPLATES } from '@/lib/studio/templates/registry'

describe('registro de templates', () => {
  it('cada receta de casa tiene exactamente tres diseños', () => {
    for (const recipe of ['open_house', 'new_listing', 'sold'] as const) {
      expect(templatesForRecipe(recipe)).toHaveLength(3)
    }
  })

  it('event y open_prompt no tienen diseños: usan el compositor de bandas', () => {
    expect(templatesForRecipe('event')).toHaveLength(0)
    expect(templatesForRecipe('open_prompt')).toHaveLength(0)
  })

  it('las claves son únicas y todos declaran 4:5', () => {
    const keys = TEMPLATES.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const t of TEMPLATES) expect(t.aspects).toContain('4:5')
  })

  it('findTemplate devuelve null para una clave inventada', () => {
    expect(findTemplate('no-existe')).toBeNull()
  })
})

describe('templateFit', () => {
  const mosaico = findTemplate('mosaico-listing')!

  it('sin avisos cuando hay fotos de sobra', () => {
    const fit = templateFit(mosaico, { photoCount: 5, hasAgentPhoto: true })
    expect(fit.warnings).toHaveLength(0)
    expect(fit.usable).toBe(true)
  })

  it('avisa por cantidad de fotos pero NUNCA bloquea', () => {
    const fit = templateFit(mosaico, { photoCount: 1, hasAgentPhoto: false })
    expect(fit.warnings.length).toBeGreaterThan(0)
    expect(fit.warnings[0]).toContain('fotos')
    // Avisar no es impedir: la decisión es del agente.
    expect(fit.usable).toBe(true)
  })

  it('el aviso habla de cantidad, no de calidad', () => {
    const fit = templateFit(mosaico, { photoCount: 2, hasAgentPhoto: false })
    expect(fit.warnings.join(' ')).not.toMatch(/buena|mala|calidad/i)
  })

  it('sin ninguna foto no es usable: no hay con qué llenar el slot obligatorio', () => {
    expect(templateFit(mosaico, { photoCount: 0, hasAgentPhoto: false }).usable).toBe(false)
  })
})
```

- [ ] **Step 2: Corre el test y verifica que falla**

Run: `npx vitest run tests/studio/template-fit.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Escribe los tipos**

Crea `src/lib/studio/templates/types.ts`:

```ts
import type { StudioRecipe, Aspect } from '../types'

// Un template declara QUÉ NECESITA y CÓMO SE DIBUJA. La declaración no es
// documentación: el formulario pide solo los slots que el diseño usa, y el
// selector avisa del desajuste ANTES de renderizar.

export type SlotKey =
  | 'photo.hero' | 'photo.thumbs' | 'photo.agent'
  | 'text.headline' | 'text.price' | 'text.when' | 'text.address' | 'text.phone' | 'text.cta'
  | 'stats' | 'logo.tenant'
  // Marcas de cumplimiento (Equal Housing y brokerage). El slot existe en el
  // contrato pero NINGÚN template de esta entrega lo usa: hoy se renderiza el
  // logo del tenant vía 'logo.tenant', y el asset de Equal Housing está
  // pendiente de confirmación legal (spec §9).
  | 'marks'

export interface Stat { icon: string; value: string }

/** Todo lo que un template puede pintar. Los opcionales pueden venir vacíos. */
export interface TemplateProps {
  // Fotos ya descargadas y convertidas a data URI — satori no debe hacer red.
  heroPhoto:   string | null
  thumbPhotos: string[]
  agentPhoto:  string | null
  logo:        string | null

  headline: string
  price:    string | null
  // Fecha y horario ya formateados. Es el slot dominante de casa abierta, donde
  // los diseños de venta ponen el precio. Se declara desde el principio para que
  // los templates de la Task 9 no obliguen a tocar este tipo.
  when:     string | null
  address:  string | null
  phone:    string | null
  cta:      string | null
  badge:    string          // "CASA ABIERTA", "NUEVA DISPONIBLE"…
  stats:    Stat[]

  agentName: string | null
  palette:   { primary: string; ink: string; surface: string }
}

export interface StudioTemplate {
  key:     string
  label:   string
  hint:    string
  recipes: StudioRecipe[]
  aspects: Aspect[]
  slots:   { required: SlotKey[]; optional: SlotKey[] }
  /** Cuántas fotos luce mejor. Solo alimenta el aviso de encaje. */
  idealPhotos: number
  render:  (props: TemplateProps) => React.ReactElement
}

export interface FitReport {
  /** false solo cuando falta algo sin lo que el diseño no puede existir. */
  usable:   boolean
  warnings: string[]
}
```

- [ ] **Step 4: Escribe el registro**

Crea `src/lib/studio/templates/registry.ts`:

```ts
import type { StudioRecipe } from '../types'
import type { FitReport, StudioTemplate } from './types'

// El registro es explícito, no un glob: importar por nombre hace que un template
// roto sea un error de compilación y no una ausencia silenciosa en el selector.
export const TEMPLATES: StudioTemplate[] = []

export function templatesForRecipe(recipe: StudioRecipe): StudioTemplate[] {
  return TEMPLATES.filter(t => t.recipes.includes(recipe))
}

export function findTemplate(key: string): StudioTemplate | null {
  return TEMPLATES.find(t => t.key === key) ?? null
}

/**
 * Cruza lo que el diseño necesita con lo que el agente tiene.
 *
 * `usable: false` SOLO cuando falta algo sin lo cual el diseño no existe (una
 * foto para el hero). Todo lo demás es aviso: si quiere el mosaico con dos
 * fotos, es su decisión — lo que no puede es enterarse al ver el resultado.
 *
 * Los avisos hablan de CANTIDAD. `photoCount` no dice si las fotos son buenas,
 * y sugerir un juicio de calidad que el sistema no hace sería mentir.
 */
export function templateFit(
  template: StudioTemplate,
  data: { photoCount: number; hasAgentPhoto: boolean },
): FitReport {
  const warnings: string[] = []
  const needsHero = template.slots.required.includes('photo.hero')

  if (data.photoCount < template.idealPhotos) {
    warnings.push(
      `Mejor con ${template.idealPhotos} fotos, tienes ${data.photoCount}`,
    )
  }
  if (template.slots.optional.includes('photo.agent') && !data.hasAgentPhoto) {
    warnings.push('Sin portada del agente, ese espacio queda vacío')
  }

  return { usable: !needsHero || data.photoCount > 0, warnings }
}
```

- [ ] **Step 5: El test sigue fallando (no hay templates todavía)**

Run: `npx vitest run tests/studio/template-fit.test.ts`
Expected: FAIL en los casos que buscan `mosaico-listing` y los conteos de 3.

**Esto es correcto y esperado.** Los templates llegan en las tareas 8–10. Marca el archivo con `describe.skip` **solo** en los dos bloques que dependen de templates concretos, con un comentario que diga qué tarea los reactiva:

```ts
// Reactivar en la Task 8: hasta entonces el registro está vacío a propósito.
describe.skip('templateFit', () => {
```

- [ ] **Step 6: Verifica y commitea**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/studio/templates tests/studio/template-fit.test.ts
git commit -m "feat(studio): contrato de templates y calculo de encaje"
```

---

## Task 5: El formulario gana `template` y `headline`

**Files:**
- Modify: `src/lib/studio/recipes.ts`
- Modify: `tests/studio/recipes.test.ts`

**Interfaces:**
- Produces: `StudioForm` gana `template?: string` y `headline?: string`; la validación cruzada template↔receta.

- [ ] **Step 1: Escribe los tests que fallan**

Añade a `tests/studio/recipes.test.ts`:

```ts
describe('template y headline', () => {
  const listing = { ...base, recipe: 'new_listing', address: '9 Bay St', price: 450000 }

  it('las recetas de casa exigen un template', () => {
    const r = parseStudioForm(listing)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('diseño')
  })

  it('acepta un template que declara esa receta', () => {
    expect(parseStudioForm({ ...listing, template: 'mosaico-listing' }).ok).toBe(true)
  })

  it('rechaza un template que no declara esa receta', () => {
    const r = parseStudioForm({ ...listing, template: 'mosaico-open-house' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('diseño')
  })

  it('rechaza una clave de template inventada', () => {
    expect(parseStudioForm({ ...listing, template: 'no-existe' }).ok).toBe(false)
  })

  it('event y open_prompt no piden template', () => {
    expect(parseStudioForm({ ...base, recipe: 'open_prompt', prompt: 'un atardecer sobre el muelle' }).ok).toBe(true)
  })

  it('headline es opcional y se limita a 60 caracteres', () => {
    const ok = parseStudioForm({ ...listing, template: 'mosaico-listing', headline: 'Casa elegante y familiar en venta' })
    expect(ok.ok).toBe(true)
    if (ok.ok) expect(ok.data.headline).toBe('Casa elegante y familiar en venta')
    expect(parseStudioForm({ ...listing, template: 'mosaico-listing', headline: 'x'.repeat(61) }).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Corre y verifica que falla**

Run: `npx vitest run tests/studio/recipes.test.ts`
Expected: FAIL en los seis casos nuevos.

- [ ] **Step 3: Implementa**

En `src/lib/studio/recipes.ts`, añade al objeto `common`:

```ts
  // El diseño elegido. Obligatorio en las recetas de casa (ver el superRefine):
  // sin él no hay dónde poner los datos.
  template: z.string().min(1).optional(),
  // Titular de marketing. La etiqueta fija ("NUEVA DISPONIBLE") describe el
  // hecho; el titular vende. Sin default, los nueve diseños dirían lo mismo.
  headline: z.string().trim().max(60, 'El titular no puede pasar de 60 caracteres').optional(),
```

Y dentro del `superRefine`, antes de las validaciones existentes:

```ts
    // Las recetas de casa se dibujan con un template; event y open_prompt siguen
    // con el compositor de bandas y no lo necesitan.
    if (PHOTO_RECIPES.includes(v.recipe)) {
      if (!v.template) {
        ctx.addIssue({ code: 'custom', path: ['template'], message: 'Elige un diseño' })
      } else {
        const t = findTemplate(v.template)
        if (!t) {
          ctx.addIssue({ code: 'custom', path: ['template'], message: 'Ese diseño no existe' })
        } else if (!t.recipes.includes(v.recipe)) {
          ctx.addIssue({ code: 'custom', path: ['template'], message: 'Ese diseño no sirve para esta receta' })
        }
      }
    }
```

Con el import: `import { findTemplate } from './templates/registry'`.

`PHOTO_RECIPES` ya existe en ese archivo y es la misma lista.

- [ ] **Step 4: Corre y verifica**

Run: `npx vitest run tests/studio/recipes.test.ts`
Expected: los casos de "no existe" y "no sirve" pasan; los que esperan un template válido siguen fallando hasta la Task 8. Márcalos con `it.skip` y el comentario de qué tarea los reactiva.

- [ ] **Step 5: Verifica y commitea**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/studio/recipes.ts tests/studio/recipes.test.ts
git commit -m "feat(studio): el formulario pide diseno y titular"
```

---

## Task 6: Armado de las props del template

**Files:**
- Create: `src/lib/studio/template-props.ts`
- Create: `tests/studio/template-props.test.ts`

**Interfaces:**
- Consumes: `StudioForm`, `StudioBrand`, `PropertyOption`, `circleCrop` de `./agent-photo`.
- Produces: `buildTemplateProps(params): Promise<TemplateProps>`; `toDataUri(buffer, mime): string`

- [ ] **Step 1: Escribe el test que falla**

Crea `tests/studio/template-props.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { badgeFor, defaultHeadline, statsFor, formatMoney } from '@/lib/studio/template-props'
import { parseStudioForm, type StudioForm } from '@/lib/studio/recipes'

function form(input: Record<string, unknown>): StudioForm {
  const r = parseStudioForm({ style: 'editorial', aspect: '4:5', template: 'mosaico-listing', ...input })
  if (!r.ok) throw new Error(r.error)
  return r.data
}

describe('props del template', () => {
  it('la etiqueta depende de la receta', () => {
    expect(badgeFor('open_house')).toBe('CASA ABIERTA')
    expect(badgeFor('new_listing')).toBe('NUEVA DISPONIBLE')
    expect(badgeFor('sold')).toBe('VENDIDA')
  })

  it('el titular cae a un default legible si el agente no lo escribe', () => {
    const f = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000 })
    expect(defaultHeadline(f).length).toBeGreaterThan(0)
    const conTitular = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000, headline: 'Casa junto al agua' })
    expect(defaultHeadline(conTitular)).toBe('Casa junto al agua')
  })

  it('las specs solo incluyen lo que existe', () => {
    const completo = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000, bedrooms: 3, bathrooms: 2, sqft: 1548 })
    expect(statsFor(completo)).toHaveLength(3)
    const vacio = form({ recipe: 'new_listing', address: '9 Bay St', price: 450000 })
    expect(statsFor(vacio)).toHaveLength(0)
  })

  it('el dinero se formatea con separadores y sin decimales', () => {
    expect(formatMoney(274400)).toBe('$274,400')
    expect(formatMoney(450000.4)).toBe('$450,000')
  })

  it('vendida sin mostrar precio no expone la cifra', () => {
    const f = form({ recipe: 'sold', template: 'mosaico-sold', address: 'Ghent', show_price: false, price: 389000 })
    expect(statsFor(f)).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Corre y verifica que falla**

Run: `npx vitest run tests/studio/template-props.test.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementa**

Crea `src/lib/studio/template-props.ts`:

```ts
import 'server-only'
import { circleCrop } from './agent-photo'
import type { StudioForm } from './recipes'
import type { StudioBrand, StudioRecipe } from './types'
import type { Stat, TemplateProps } from './templates/types'

// Traduce el formulario + la marca + las fotos a lo que un template pinta.
// Vive separado de los templates para que los nueve compartan exactamente las
// mismas reglas de formato: una fecha o un precio no pueden verse distintos
// según el diseño elegido.

const BADGES: Record<StudioRecipe, string> = {
  open_house:  'CASA ABIERTA',
  new_listing: 'NUEVA DISPONIBLE',
  sold:        'VENDIDA',
  event:       '',
  open_prompt: '',
}

export function badgeFor(recipe: StudioRecipe): string {
  return BADGES[recipe]
}

export function formatMoney(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

/** El titular del agente, o uno derivado del hecho si no lo escribió. */
export function defaultHeadline(form: StudioForm): string {
  if (form.headline) return form.headline
  switch (form.recipe) {
    case 'open_house':  return 'Casa abierta este fin de semana'
    case 'new_listing': return 'Nueva casa disponible'
    case 'sold':        return 'Otra familia en su nuevo hogar'
    default:            return ''
  }
}

export function statsFor(form: StudioForm): Stat[] {
  if (form.recipe !== 'new_listing') return []
  const out: Stat[] = []
  if (form.sqft !== undefined)      out.push({ icon: 'ruler', value: `${form.sqft.toLocaleString('en-US')} sqft` })
  if (form.bedrooms !== undefined)  out.push({ icon: 'bed',   value: `${form.bedrooms} hab` })
  if (form.bathrooms !== undefined) out.push({ icon: 'bath',  value: `${form.bathrooms} baños` })
  return out
}

/** satori no debe hacer red: las imágenes entran ya codificadas. */
export function toDataUri(buffer: Buffer, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${buffer.toString('base64')}`
}

async function fetchImage(url: string): Promise<Buffer | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function buildTemplateProps(params: {
  form:        StudioForm
  brand:       StudioBrand
  photoUrls:   string[]
  agentPhoto:  { url: string; cutout: boolean } | null
}): Promise<TemplateProps> {
  const { form, brand } = params

  // Las fotos se bajan en paralelo y una que falle no rompe la pieza: el
  // template pinta lo que haya.
  const photos = (await Promise.all(params.photoUrls.slice(0, 4).map(fetchImage)))
    .filter((b): b is Buffer => b !== null)
    .map(b => toDataUri(b))

  let agentPhoto: string | null = null
  if (params.agentPhoto) {
    const raw = await fetchImage(params.agentPhoto.url)
    if (raw) {
      // Recorte real → tal cual. Foto normal → círculo.
      agentPhoto = params.agentPhoto.cutout
        ? toDataUri(raw, 'image/png')
        : toDataUri(await circleCrop(raw, 480), 'image/png')
    }
  }

  const logoBuf = brand.logo_url ? await fetchImage(brand.logo_url) : null

  const price =
    form.recipe === 'new_listing' ? formatMoney(form.price)
    : form.recipe === 'sold' && form.show_price && form.price !== undefined ? formatMoney(form.price)
    : null

  return {
    heroPhoto:   photos[0] ?? null,
    thumbPhotos: photos.slice(1),
    agentPhoto,
    logo:        logoBuf ? toDataUri(logoBuf, 'image/png') : null,
    headline:    defaultHeadline(form),
    price,
    address:     'address' in form ? form.address : null,
    phone:       brand.agent_phone,
    cta:         null,
    badge:       badgeFor(form.recipe),
    stats:       statsFor(form),
    agentName:   brand.agent_name,
    palette: {
      primary: form.palette[0] ?? brand.primary_color,
      ink:     '#FFFFFF',
      surface: '#FBF6EE',
    },
  }
}
```

- [ ] **Step 4: Corre y verifica que pasa**

Run: `npx vitest run tests/studio/template-props.test.ts`
Expected: PASS (5 tests). Los casos que usan `template: 'mosaico-listing'` fallarán hasta la Task 8 — márcalos con `it.skip` y el comentario correspondiente.

- [ ] **Step 5: Verifica y commitea**

```bash
npm run lint && npx tsc --noEmit
git add src/lib/studio/template-props.ts tests/studio/template-props.test.ts
git commit -m "feat(studio): armado de props comun a los nueve disenos"
```

---

## Task 7: Primitivas compartidas

**Files:**
- Create: `src/lib/studio/templates/primitives.tsx`
- Create: `tests/studio/primitives.test.tsx`

**Interfaces:**
- Produces: `<Band>`, `<PhotoCard>`, `<StatRow>`, `<AgentCutout>`, `<Headline>`, `<Badge>`, `ICONS`

- [ ] **Step 1: Escribe las primitivas**

Crea `src/lib/studio/templates/primitives.tsx`:

```tsx
import type { Stat } from './types'

// Bloques compartidos por los nueve diseños. Existen para que las tres variantes
// de una receta se vean como la misma familia y para que un ajuste de sombra o
// de radio se haga en un sitio.
//
// RECORDATORIO satori: todo elemento con más de un hijo necesita display:'flex'.

export const ICONS: Record<string, string> = {
  ruler: 'M3 12h18M6 9v6M12 9v6M18 9v6',
  bed:   'M3 18v-6h18v6M3 12V8h8v4M14 12V8h7v4',
  bath:  'M4 12h16v4a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z M7 12V5a2 2 0 0 1 4 0',
  pin:   'M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  phone: 'M4 4h4l2 5-2 2a12 12 0 0 0 5 5l2-2 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 2 6a2 2 0 0 1 2-2z',
}

function Icon({ path, color, size = 26 }: { path: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={path} />
    </svg>
  )
}

export function Band({ color, height, children, bottom = 0 }: {
  color: string; height: number; bottom?: number; children: React.ReactNode
}) {
  return (
    <div style={{
      display: 'flex', position: 'absolute', left: 0, bottom, width: 1080, height,
      backgroundColor: color, alignItems: 'center', paddingLeft: 60, paddingRight: 60,
    }}>
      {children}
    </div>
  )
}

export function PhotoCard({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- reason: satori no es DOM; rasteriza a SVG
    <img src={src} width={width} height={height} alt=""
         style={{ objectFit: 'cover', borderRadius: 14, boxShadow: '0 6px 20px rgba(0,0,0,0.28)' }} />
  )
}

export function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ fontFamily: 'Marcellus', fontSize: 26, letterSpacing: 6, color }}>
      {text}
    </span>
  )
}

/**
 * Titular con énfasis alterno. El agente escribe texto plano — pedirle que
 * marque negritas sería pedirle que maquete. El diseño decide el ritmo:
 * destaca una palabra de cada dos.
 */
export function Headline({ text, color, size }: { text: string; color: string; size: number }) {
  const words = text.split(' ').filter(Boolean)
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', maxWidth: 900 }}>
      {words.map((w, i) => (
        <span key={i} style={{
          fontFamily: 'Spectral',
          fontWeight: i % 2 === 0 ? 400 : 800,
          fontSize: size, lineHeight: 1.08, color, marginRight: 14,
        }}>
          {w}
        </span>
      ))}
    </div>
  )
}

export function StatRow({ stats, color }: { stats: Stat[]; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {stats.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', marginRight: 40 }}>
          <Icon path={ICONS[s.icon] ?? ICONS.ruler} color={color} />
          <span style={{ fontFamily: 'Spectral', fontSize: 27, color, marginLeft: 10 }}>{s.value}</span>
        </div>
      ))}
    </div>
  )
}

/** La portada del agente, ya recortada o encerrada en círculo por template-props. */
export function AgentCutout({ src, width, height }: { src: string; width: number; height: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- reason: ídem PhotoCard
    <img src={src} width={width} height={height} alt=""
         style={{ position: 'absolute', right: 20, bottom: 0, objectFit: 'contain' }} />
  )
}
```

- [ ] **Step 2: Escribe el test**

Crea `tests/studio/primitives.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { renderToPng } from '@/lib/studio/render/satori'
import { Band, Headline, StatRow, Badge } from '@/lib/studio/templates/primitives'

describe('primitivas', () => {
  it('cada primitiva renderiza sin lanzar', async () => {
    const el = (
      <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: '#FBF6EE', position: 'relative' }}>
        <div style={{ display: 'flex', flexDirection: 'column', padding: 60 }}>
          <Badge text="NUEVA DISPONIBLE" color="#C9A96E" />
          <Headline text="Casa elegante y familiar en venta" color="#1B2A41" size={64} />
        </div>
        <Band color="#1B2A41" height={120}>
          <StatRow stats={[{ icon: 'ruler', value: '1548 sqft' }, { icon: 'bed', value: '3 hab' }]} color="#FFFFFF" />
        </Band>
      </div>
    )
    const meta = await sharp(await renderToPng(el, { width: 1080, height: 1350 })).metadata()
    expect(meta.width).toBe(1080)
    expect(meta.height).toBe(1350)
  })

  it('un titular de una sola palabra no rompe el énfasis alterno', async () => {
    const el = (
      <div style={{ display: 'flex', width: 1080, height: 1350, backgroundColor: '#FFF' }}>
        <Headline text="Vendida" color="#1B2A41" size={64} />
      </div>
    )
    expect((await sharp(await renderToPng(el, { width: 1080, height: 1350 })).metadata()).width).toBe(1080)
  })

  it('una lista de specs vacía no deja una fila fantasma', async () => {
    const el = (
      <div style={{ display: 'flex', width: 1080, height: 1350, backgroundColor: '#FFF' }}>
        <StatRow stats={[]} color="#000" />
      </div>
    )
    expect((await sharp(await renderToPng(el, { width: 1080, height: 1350 })).metadata()).height).toBe(1350)
  })
})
```

- [ ] **Step 3: Corre, verifica y commitea**

```bash
npx vitest run tests/studio/primitives.test.tsx
npm run lint && npx tsc --noEmit
git add src/lib/studio/templates/primitives.tsx tests/studio/primitives.test.tsx
git commit -m "feat(studio): primitivas compartidas de los disenos"
```

---

## Tasks 8–10: Los nueve templates

Las tres tareas son la misma forma con distinta receta. **Cada una termina con revisión visual tuya**, y esa revisión es el criterio de aceptación real — ningún test dice si un diseño se ve bien.

### Especificación de los nueve

| Clave | Receta | Variante | `idealPhotos` | Slots requeridos |
|---|---|---|---|---|
| `mosaico-listing` | `new_listing` | Mosaico | 4 | `photo.hero`, `text.headline`, `text.price` |
| `completa-listing` | `new_listing` | Foto completa | 1 | `photo.hero`, `text.headline`, `text.price` |
| `editorial-listing` | `new_listing` | Editorial | 1 | `text.headline`, `text.price` |
| `mosaico-open-house` | `open_house` | Mosaico | 4 | `photo.hero`, `text.headline` |
| `completa-open-house` | `open_house` | Foto completa | 1 | `photo.hero`, `text.headline` |
| `editorial-open-house` | `open_house` | Editorial | 1 | `text.headline` |
| `mosaico-sold` | `sold` | Mosaico | 4 | `photo.hero`, `text.headline` |
| `completa-sold` | `sold` | Foto completa | 1 | `photo.hero`, `text.headline` |
| `editorial-sold` | `sold` | Editorial | 1 | `text.headline` |

**Layout de cada variante en 1080×1350:**

- **Mosaico** — hero a sangre de `y=0` a `y=700`; tres `PhotoCard` de 300×220 en `y=560`, `x=60/380/700`, superpuestas al hero; logo del tenant arriba a la izquierda en 150×150; `Badge` + `Headline` (size 62) desde `y=780`; dirección y teléfono con ícono a la derecha del titular; `Band` de specs (color primario, alto 110) en `bottom=130`; `Band` de precio (primario oscurecido, alto 130) en `bottom=0`; `AgentCutout` de 300×520 a la derecha si hay portada.
- **Foto completa** — hero a sangre ocupando el lienzo entero; degradado `linear-gradient(transparent 45%, rgba(0,0,0,0.82) 100%)` como capa absoluta; todo el texto en la mitad inferior, alineado a la izquierda desde `x=70`: `Badge`, `Headline` (size 68), precio (size 76), dirección, `StatRow`; logo abajo a la derecha en 110×110.
- **Editorial** — banda de color primario de `y=0` a `y=520` con `Badge` + `Headline` (size 72) + precio; `PhotoCard` de 960×420 centrada en `y=560`; dirección y `StatRow` desde `y=1020`; `Band` de marca en `bottom=0` con nombre del agente y logo.

## Task 8: Los tres diseños de "nueva disponible"

**Files:**
- Create: `src/lib/studio/templates/mosaico-listing.tsx`, `completa-listing.tsx`, `editorial-listing.tsx`
- Modify: `src/lib/studio/templates/registry.ts`
- Create: `tests/studio/templates.test.tsx`

- [ ] **Step 1: Escribe `mosaico-listing.tsx`**

Sigue el layout de la tabla, usando las primitivas de la Task 7 y **solo** las props de `TemplateProps`. Nada de valores fijos de tenant: colores desde `props.palette`, textos desde las props.

```tsx
import { Band, Badge, Headline, StatRow, PhotoCard, AgentCutout } from './primitives'
import type { StudioTemplate, TemplateProps } from './types'

function darken(hex: string): string {
  // Banda inferior: el mismo color, más oscuro, sin traer una librería.
  const n = parseInt(hex.slice(1), 16)
  const f = 0.62
  const r = Math.round(((n >> 16) & 255) * f)
  const g = Math.round(((n >> 8) & 255) * f)
  const b = Math.round((n & 255) * f)
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

function Render(p: TemplateProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 1080, height: 1350, backgroundColor: p.palette.surface, position: 'relative' }}>
      {p.heroPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: satori rasteriza a SVG
        <img src={p.heroPhoto} width={1080} height={700} alt="" style={{ objectFit: 'cover' }} />
      )}

      {p.logo && (
        // eslint-disable-next-line @next/next/no-img-element -- reason: ídem
        <img src={p.logo} width={150} height={150} alt=""
             style={{ position: 'absolute', top: 30, left: 40, objectFit: 'contain' }} />
      )}

      {p.thumbPhotos.length > 0 && (
        <div style={{ display: 'flex', position: 'absolute', top: 560, left: 60 }}>
          {p.thumbPhotos.slice(0, 3).map((src, i) => (
            <div key={i} style={{ display: 'flex', marginRight: 20 }}>
              <PhotoCard src={src} width={300} height={220} />
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', position: 'absolute', top: 820, left: 60 }}>
        <Badge text={p.badge} color={p.palette.primary} />
        <Headline text={p.headline} color="#1B2A41" size={62} />
        {p.address && (
          <span style={{ fontFamily: 'Spectral', fontSize: 28, color: '#33415A', marginTop: 18 }}>{p.address}</span>
        )}
      </div>

      <Band color={p.palette.primary} height={110} bottom={130}>
        <StatRow stats={p.stats} color="#FFFFFF" />
      </Band>

      <Band color={darken(p.palette.primary)} height={130} bottom={0}>
        <span style={{ fontFamily: 'Spectral', fontWeight: 800, fontSize: 62, color: '#FFFFFF' }}>
          {p.price ?? ''}
        </span>
      </Band>

      {p.agentPhoto && <AgentCutout src={p.agentPhoto} width={300} height={520} />}
    </div>
  )
}

export const mosaicoListing: StudioTemplate = {
  key: 'mosaico-listing',
  label: 'Mosaico',
  hint: 'Cuatro fotos o más',
  recipes: ['new_listing'],
  aspects: ['4:5'],
  idealPhotos: 4,
  slots: {
    required: ['photo.hero', 'text.headline', 'text.price'],
    optional: ['photo.thumbs', 'photo.agent', 'stats', 'text.address', 'logo.tenant'],
  },
  render: Render,
}
```

- [ ] **Step 2: Escribe `completa-listing.tsx` y `editorial-listing.tsx`**

Mismo esqueleto, layout según la tabla. `completa-listing` tiene `idealPhotos: 1` y no usa `photo.thumbs`; `editorial-listing` no requiere `photo.hero` (por eso su `templateFit` es usable sin fotos).

- [ ] **Step 3: Regístralos**

En `registry.ts`:

```ts
import { mosaicoListing } from './mosaico-listing'
import { completaListing } from './completa-listing'
import { editorialListing } from './editorial-listing'

export const TEMPLATES: StudioTemplate[] = [
  mosaicoListing, completaListing, editorialListing,
]
```

- [ ] **Step 4: Escribe el test de los templates**

Crea `tests/studio/templates.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { renderToPng } from '@/lib/studio/render/satori'
import { TEMPLATES } from '@/lib/studio/templates/registry'
import type { TemplateProps } from '@/lib/studio/templates/types'

const OUT = process.env.STUDIO_OUT_DIR

async function photo(r: number, g: number, b: number): Promise<string> {
  const png = await sharp({ create: { width: 600, height: 450, channels: 3, background: { r, g, b } } }).png().toBuffer()
  return `data:image/png;base64,${png.toString('base64')}`
}

async function props(over: Partial<TemplateProps> = {}): Promise<TemplateProps> {
  return {
    heroPhoto: await photo(120, 150, 190),
    thumbPhotos: [await photo(200, 200, 195), await photo(180, 175, 170), await photo(160, 165, 175)],
    agentPhoto: null,
    logo: null,
    headline: 'Casa elegante y familiar en venta',
    price: '$274,400',
    address: '1909 Ocean View Avenue, Norfolk, VA',
    phone: '+1 757 555 0199',
    cta: null,
    badge: 'NUEVA DISPONIBLE',
    stats: [{ icon: 'ruler', value: '1,548 sqft' }, { icon: 'bed', value: '3 hab' }, { icon: 'bath', value: '2 baños' }],
    agentName: 'Adriana Melendez',
    palette: { primary: '#1B2A41', ink: '#FFFFFF', surface: '#FBF6EE' },
    ...over,
  }
}

describe('templates', () => {
  for (const t of TEMPLATES) {
    it(`${t.key} rinde 1080x1350`, async () => {
      const png = await renderToPng(t.render(await props()), { width: 1080, height: 1350 })
      const meta = await sharp(png).metadata()
      expect(meta.width).toBe(1080)
      expect(meta.height).toBe(1350)
      if (OUT) writeFileSync(`${OUT}/${t.key}.png`, png)
    })

    it(`${t.key} rinde sin portada de agente y sin logo`, async () => {
      const png = await renderToPng(t.render(await props({ agentPhoto: null, logo: null })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).height).toBe(1350)
    })

    it(`${t.key} aguanta un titular larguísimo y una dirección larguísima`, async () => {
      const png = await renderToPng(t.render(await props({
        headline: 'Una casa absolutamente espectacular y enorme junto al agua con vistas',
        address: 'Un nombre de calle desmesuradamente largo, Virginia Beach, Virginia, Estados Unidos',
      })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).width).toBe(1080)
    })

    it(`${t.key} rinde sin miniaturas`, async () => {
      const png = await renderToPng(t.render(await props({ thumbPhotos: [] })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).width).toBe(1080)
    })
  }
})
```

- [ ] **Step 5: Reactiva los tests que dejaste en skip**

Quita el `describe.skip` de `tests/studio/template-fit.test.ts` (bloque `templateFit`) y los `it.skip` de `recipes.test.ts` y `template-props.test.ts`. **Ajusta el test de "tres diseños por receta"** para que por ahora solo exija los de `new_listing`; vuelve a los tres en la Task 10.

- [ ] **Step 6: Revisión visual — el criterio de aceptación**

```bash
mkdir -p .studio-qa && STUDIO_OUT_DIR=$PWD/.studio-qa npx vitest run tests/studio/templates.test.tsx
```

Mira los tres PNG y responde: ¿lo publicarías? Concretamente: el precio domina, el titular se lee, nada se sale del lienzo, las miniaturas no tapan algo importante, la banda de specs no compite con el precio.

**Ajusta tamaños y posiciones hasta que la respuesta sea sí.** Esta iteración es el trabajo, no un extra.

- [ ] **Step 7: Verifica y commitea**

```bash
rm -rf .studio-qa
npm run lint && npx tsc --noEmit && npm run test:unit
git add src/lib/studio/templates tests/studio
git commit -m "feat(studio): tres disenos para nueva disponible"
```

## Task 9: Los tres diseños de "casa abierta"

**Files:**
- Create: `src/lib/studio/templates/mosaico-open-house.tsx`, `completa-open-house.tsx`, `editorial-open-house.tsx`
- Modify: `src/lib/studio/templates/registry.ts`, `src/lib/studio/template-props.ts`, `tests/studio/templates.test.tsx`

- [ ] **Step 1: Llena `when` en las props**

En `template-props.ts`, dentro de `buildTemplateProps`, añade al objeto devuelto:

```ts
    when: form.recipe === 'open_house'
      ? `${formatDate(form.date)} · ${form.time_start}–${form.time_end}`
      : null,
```

Y exporta el `formatDate` que ya usa el compositor de bandas (`src/lib/studio/compositor.ts`) o duplícalo aquí con los mismos nombres de mes en español — **no** uses `toLocaleDateString`, que depende del ICU del runtime.

- [ ] **Step 2: Escribe los tres templates**

Claves `mosaico-open-house`, `completa-open-house`, `editorial-open-house`, con `recipes: ['open_house']`. Layout según la tabla de la sección "Especificación de los nueve", con **una diferencia estructural**: no hay precio. Donde los diseños de venta ponen `p.price` en la banda inferior, estos ponen `p.when` — la fecha y el horario son el dato por el que se publica una casa abierta. `text.price` no aparece en `slots.required`; `text.when` sí.

- [ ] **Step 3: Regístralos** en `registry.ts`, añadiéndolos al array `TEMPLATES`.

- [ ] **Step 4: Amplía el fixture del test**

En `tests/studio/templates.test.tsx`, añade `when: '15 de agosto de 2026 · 11:00–14:00'` a la función `props()`. El bucle sobre `TEMPLATES` ya cubre los nuevos automáticamente.

- [ ] **Step 5: Revisión visual — el criterio de aceptación**

```bash
mkdir -p .studio-qa && STUDIO_OUT_DIR=$PWD/.studio-qa npx vitest run tests/studio/templates.test.tsx
```

Mira los tres y pregunta lo mismo que en la Task 8, cambiando "el precio domina" por "la fecha y el horario dominan". Ajusta hasta que la respuesta sea sí.

- [ ] **Step 6: Verifica y commitea**

```bash
rm -rf .studio-qa
npm run lint && npx tsc --noEmit && npm run test:unit
git add src/lib/studio tests/studio
git commit -m "feat(studio): tres disenos para casa abierta"
```

## Task 10: Los tres diseños de "vendida"

**Files:**
- Create: `src/lib/studio/templates/mosaico-sold.tsx`, `completa-sold.tsx`, `editorial-sold.tsx`
- Modify: `src/lib/studio/templates/registry.ts`, `tests/studio/templates.test.tsx`, `tests/studio/template-fit.test.ts`

- [ ] **Step 1: Escribe los tres templates**

Claves `mosaico-sold`, `completa-sold`, `editorial-sold`, con `recipes: ['sold']`. Layout según la tabla de la sección "Especificación de los nueve", con dos diferencias:

- **El precio es opcional** (`form.show_price`): muchos agentes no publican la cifra de un cierre. El diseño tiene que verse bien con y sin ella — sin cifra, la banda inferior la ocupa el nombre del agente.
- **La nota** (`p.cta`, alimentada desde `form.note`: "Vendida en 9 días") ocupa el lugar donde los diseños de venta ponen las specs.

- [ ] **Step 2: Llena `cta` con la nota**

En `template-props.ts`, dentro del objeto devuelto, sustituye `cta: null` por:

```ts
    cta: form.recipe === 'sold' ? (form.note ?? null) : null,
```

- [ ] **Step 3: Regístralos** en `registry.ts`.

- [ ] **Step 4: Añade el test del precio ausente**

En `tests/studio/templates.test.tsx`, dentro del bucle sobre `TEMPLATES`:

```tsx
    it(`${t.key} rinde sin precio`, async () => {
      const png = await renderToPng(t.render(await props({ price: null })), { width: 1080, height: 1350 })
      expect((await sharp(png).metadata()).height).toBe(1350)
    })
```

- [ ] **Step 5: Devuelve el registro a su forma completa**

En `tests/studio/template-fit.test.ts`, el test "cada receta de casa tiene exactamente tres diseños" vuelve a exigir las tres recetas (revierte el ajuste de la Task 8, Step 5).

- [ ] **Step 6: Revisión visual y commit**

```bash
mkdir -p .studio-qa && STUDIO_OUT_DIR=$PWD/.studio-qa npx vitest run tests/studio/templates.test.tsx
rm -rf .studio-qa
npm run lint && npx tsc --noEmit && npm run test:unit
git add src/lib/studio tests/studio
git commit -m "feat(studio): tres disenos para vendida"
```

---

## Task 11: Miniaturas del selector

**Files:**
- Create: `scripts/gen-template-thumbs.mjs`
- Create: `public/studio/templates/*.webp` (generado, commiteado)
- Create: `public/studio/fixtures/*.jpg` (fotos neutras, commiteadas)
- Create: `tests/studio/thumbnails.test.ts`

- [ ] **Step 1: Consigue las fotos neutras**

**No uses imágenes de internet.** Es una página que ve el cliente y la licencia ajena es un problema real; tampoco pueden ser fotos de A&J, que sería hardcodear datos de un tenant.

Genera **cuatro casas neutras una sola vez** con Nano Banana (una fachada, dos interiores, un exterior de tarde) y guárdalas en `public/studio/fixtures/`. Coste: centavos, una vez, sin dueño.

- [ ] **Step 2: Escribe el script**

Crea `scripts/gen-template-thumbs.mjs`: importa `TEMPLATES`, arma unas props de ejemplo con las fotos de `public/studio/fixtures/`, renderiza cada template con `renderToPng`, redimensiona a 400px de ancho con sharp y escribe `public/studio/templates/<key>.webp`.

- [ ] **Step 3: Genera y commitea las miniaturas**

```bash
node scripts/gen-template-thumbs.mjs
```

- [ ] **Step 4: Escribe el test que impide el olvido**

Crea `tests/studio/thumbnails.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { TEMPLATES } from '@/lib/studio/templates/registry'

describe('miniaturas', () => {
  it('todo template tiene su miniatura commiteada', () => {
    // El olvido común: añades el décimo diseño y el selector lo muestra roto.
    for (const t of TEMPLATES) {
      const p = join(process.cwd(), 'public', 'studio', 'templates', `${t.key}.webp`)
      expect(existsSync(p), `falta la miniatura de ${t.key} — corre scripts/gen-template-thumbs.mjs`).toBe(true)
    }
  })
})
```

- [ ] **Step 5: Verifica y commitea**

```bash
npx vitest run tests/studio/thumbnails.test.ts
npm run lint && npx tsc --noEmit
git add scripts/gen-template-thumbs.mjs public/studio tests/studio/thumbnails.test.ts
git commit -m "feat(studio): miniaturas de los disenos y script que las genera"
```

---

## Task 12: Selector visual

**Files:**
- Create: `src/app/(dashboard)/studio/template-picker.tsx`
- Modify: `src/app/(dashboard)/studio/recipe-form.tsx`
- Modify: `src/lib/data/studio.ts` (exponer `cover_photo_url`/`cover_photo_cutout` en `AgentOption`)

- [ ] **Step 1: Amplía `AgentOption`**

En `src/lib/data/studio.ts`, añade `cover_photo_url` y `cover_photo_cutout` a `AGENT_COLUMNS` y a la interfaz `AgentOption`, y mapéalos en `getAgentOptions`.

- [ ] **Step 2: Escribe el selector**

Crea `src/app/(dashboard)/studio/template-picker.tsx`: tres tarjetas en grid, cada una con la miniatura (`/studio/templates/<key>.webp`), el `label`, el `hint`, y los `warnings` de `templateFit` en una píldora `var(--bg-warning)` / `var(--text-warning)`. La seleccionada lleva `border: 2px solid var(--accent-gold)`.

**El aviso no deshabilita la tarjeta.** Si el agente quiere el mosaico con dos fotos, es su decisión.

```tsx
'use client'

import { templateFit } from '@/lib/studio/templates/registry'
import type { StudioTemplate } from '@/lib/studio/templates/types'

export function TemplatePicker({ templates, value, onChange, photoCount, hasAgentPhoto }: {
  templates: StudioTemplate[]
  value: string
  onChange: (key: string) => void
  photoCount: number
  hasAgentPhoto: boolean
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', marginBottom: '18px' }}>
      {templates.map(t => {
        const fit = templateFit(t, { photoCount, hasAgentPhoto })
        const active = t.key === value
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            style={{
              padding: '8px', textAlign: 'left', cursor: 'pointer',
              background: 'var(--bg-surface)', borderRadius: '12px',
              border: `${active ? 2 : 1}px solid ${active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- reason: asset estático del repo, no necesita optimización remota */}
            <img src={`/studio/templates/${t.key}.webp`} alt={t.label}
                 style={{ width: '100%', display: 'block', borderRadius: '6px', aspectRatio: '4/5', objectFit: 'cover' }} />
            <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '8px' }}>{t.label}</div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.35 }}>{t.hint}</div>
            {fit.warnings.map((w, i) => (
              <div key={i} style={{
                fontSize: '11px', color: 'var(--status-warm, #e07b3a)', marginTop: '6px', lineHeight: 1.3,
              }}>
                {w}
              </div>
            ))}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Móntalo en el formulario**

En `recipe-form.tsx`, después del selector de propiedad y **antes** de los campos de la receta, monta `<TemplatePicker>` cuando `HOUSE_RECIPES.includes(recipe)`. Añade el estado `template` y mételo en el `payload` del submit. Añade también el campo `headline` (texto, máx. 60, con placeholder "Casa elegante y familiar en venta").

`photoCount` sale de `property?.photos.length ?? 0`; `hasAgentPhoto` de la opción de agente seleccionada.

- [ ] **Step 4: Verifica y commitea**

```bash
npm run lint && npx tsc --noEmit
git add "src/app/(dashboard)/studio" src/lib/data/studio.ts
git commit -m "feat(studio): selector visual de disenos con aviso de encaje"
```

---

## Task 13: Previsualizar y guardar

**Files:**
- Modify: `src/lib/studio/generate.ts`
- Modify: `src/app/(dashboard)/studio/actions.ts`
- Modify: `src/app/(dashboard)/studio/recipe-form.tsx`

**Interfaces:**
- Consumes: `findTemplate` del registro, `buildTemplateProps`, `renderToPng`, `getStudioBrand`, `getPropertyOptions`.
- Produces:
  - `renderTemplatePiece(params: { ctx: TenantContext; form: StudioForm }): Promise<Buffer>` — arma props y renderiza. No persiste nada, no llama a IA.
  - `previewStudioImage(formData: FormData): Promise<ActionResult<{ dataUri: string }>>`

- [ ] **Step 1: Extrae el render de template en `generate.ts`**

Añade una rama al pipeline: si `form.template` existe, en vez de llamar al director de prompt y a Nano Banana, arma las props con `buildTemplateProps` y renderiza con `renderToPng`. Guarda `template` en la fila. Coste 0, sin gate de IA.

- [ ] **Step 2: Añade la action de previsualización**

En `actions.ts`:

```ts
/**
 * Renderiza y devuelve la imagen SIN escribir en la base ni en el bucket.
 * Solo existe en la ruta gratis: con IA, previsualizar costaría dinero y
 * "gratis de probar" dejaría de ser cierto. Sin esto, saltar entre nueve
 * diseños deja nueve filas de basura en la biblioteca.
 */
export async function previewStudioImage(formData: FormData): Promise<ActionResult<{ dataUri: string }>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Acceso no autorizado' }

  const raw = formData.get('payload')
  if (typeof raw !== 'string') return { ok: false, error: 'Faltan los datos del formulario' }

  let parsedJson: unknown
  try { parsedJson = JSON.parse(raw) } catch { return { ok: false, error: 'Los datos del formulario no son válidos' } }

  const parsed = parseStudioForm(parsedJson)
  if (!parsed.ok) return parsed
  if (!parsed.data.template) {
    return { ok: false, error: 'La previsualización solo existe para los diseños con plantilla' }
  }
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant antes de previsualizar' }

  const png = await renderTemplatePiece({ ctx, form: parsed.data })
  return { ok: true, data: { dataUri: `data:image/png;base64,${png.toString('base64')}` } }
}
```

- [ ] **Step 3: Dos botones en el formulario**

En `recipe-form.tsx`: **Previsualizar** (solo visible con template) que pinta el resultado en un panel al lado, y **Guardar en la biblioteca** que llama a `createStudioImage` como hoy.

- [ ] **Step 4: Verifica y commitea**

```bash
npm run lint && npx tsc --noEmit && npm run test:unit
git add src/lib/studio/generate.ts "src/app/(dashboard)/studio"
git commit -m "feat(studio): previsualizar sin persistir y guardar aparte"
```

---

## Task 14: Retirar lo que sobra y arreglar el teléfono descompuesto

**Files:**
- Modify: `src/lib/studio/recipes.ts`, `prompt-director.ts`, `generate.ts`, `recipe-form.tsx`
- Modify: `tests/studio/recipes.test.ts`, `tests/studio/prompt-director.test.ts`

- [ ] **Step 1: Retira `style` y `composition`**

En `recipes.ts`, `reference_role` pasa a `z.enum(['subject'])`. En `prompt-director.ts`, `REFERENCE_RULES` se queda solo con `subject`. En `recipe-form.tsx`, el selector de rol desaparece: con una sola opción, adjuntar una referencia ya significa "es la casa" — y el texto de ayuda lo dice.

Actualiza los tests que comprueban `style` y `composition`; el de `subject` se queda.

- [ ] **Step 2: Arregla la paleta y la regla de referencia**

En `generate.ts`, después de `directScene`, concatena de forma **determinista** al `scene_prompt` lo que hoy solo vive en el system prompt de Claude:

```ts
// El scene_prompt es lo ÚNICO que ve el modelo de imagen. La paleta y la regla
// de referencia vivían solo en el system prompt de Claude, así que se perdían
// si él no las repetía — por eso ninguna imagen respetaba los colores.
let scenePrompt = direction.direction.scene_prompt
if (form.palette.length) {
  scenePrompt += ` Color grading and accents drawn from: ${form.palette.join(', ')}.`
}
if (form.has_reference && form.reference_role === 'subject') {
  scenePrompt += ' Preserve the attached building exactly: architecture, geometry, proportions and materials. Change only light, sky, weather and framing.'
}
```

- [ ] **Step 3: Verifica y commitea**

```bash
npm run lint && npx tsc --noEmit && npm run test:unit
git add src/lib/studio "src/app/(dashboard)/studio" tests/studio
git commit -m "fix(studio): la paleta y la referencia llegan al modelo de imagen"
```

---

## Task 15: Verificación end-to-end

- [ ] **Step 1: Suite completa y build**

```bash
npm run lint && npx tsc --noEmit && npm run test:unit && npm run build
```

- [ ] **Step 2: Preview**

`preview_start` con el dev server. Comprueba `/settings` (control de portada del agente) y `/studio` (selector con las nueve miniaturas, aviso de encaje, previsualización). **La app es Magic Link: si no puedes autenticarte, dilo en el reporte** en vez de darlo por verificado.

- [ ] **Step 3: Revisión visual de los nueve, uno por uno**

```bash
mkdir -p .studio-qa && STUDIO_OUT_DIR=$PWD/.studio-qa npx vitest run tests/studio/templates.test.tsx
```

Este es el criterio de aceptación del plan. Ningún test dice si un diseño se ve bien.

- [ ] **Step 4: Comprueba que la ruta con template no gastó nada**

```sql
select feature, count(*) from ai_usage_events
where created_at > now() - interval '1 hour' group by feature;
```

Expected: **ninguna fila nueva** por las piezas hechas con template.

- [ ] **Step 5: Push**

```bash
git push -u origin feat/studio-templates
```

**El PR lo abre Dylan manualmente.**

---

## Enmienda (durante la ejecución de la Task 5)

**El template NO es obligatorio en el esquema.** La Task 5 lo pedía dentro del
`superRefine`, y eso rompía las piezas creadas antes de los templates: hay dos
filas reales de `open_house` con `template` nulo, y `recomposeImage` /
`regenerateStudioImage` vuelven a pasar su `form_json` por `parseStudioForm`.
Con el template obligatorio en el esquema, esas piezas dejaban de poder
recomponerse.

La validación quedó partida en dos, que son cosas distintas:

| Dónde | Qué valida |
|---|---|
| `superRefine` del esquema | Si el template **viene**, que exista y sirva para esa receta — integridad del dato |
| `requireTemplate(form)`, llamada desde `createStudioImage` | Que una pieza **nueva** de casa lo traiga — política de producto |

Las tareas 12 y 13 deben usar `requireTemplate` en el camino de creación, no
esperar que `parseStudioForm` lo rechace.

## Notas de ejecución

- **La Task 1 puede matar el plan.** Si satori no puede con el diseño de referencia, para y repórtalo: la salida es coordenadas a mano con menos templates, no forzar la librería.
- **Las tareas 8, 9 y 10 no son paralelizables con las demás** aunque lo parezcan: cada una reactiva tests que las anteriores dejaron en skip.
- **Descarga las fotos una vez por propiedad** y reúsalas entre templates. Nueve previsualizaciones seguidas son hasta 36 descargas si no se cachea.
- `npm run test:rls` no cambia en este plan: las columnas nuevas van en `agents`, que ya tiene su policy.
