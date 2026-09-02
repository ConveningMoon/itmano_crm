import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAiWithinLimit } from '@/lib/services/ai-limit'
import { recordAiUsage, IMAGE_UNIT_COST_USD } from '@/lib/services/ai-usage'
import { getStudioBrand } from '@/lib/data/studio'
import { directScene, DIRECTOR_MODEL } from '@/lib/studio/prompt-director'
import { resolveBackground } from '@/lib/studio/background'
import { finishFreeImage } from '@/lib/studio/finish-free-image'
import { parseStudioForm } from '@/lib/studio/recipes'
import { CANVAS } from '@/lib/studio/canvas'
import type { TenantContext } from '@/lib/auth/tenant-context'

// Portada de una edición, generada con el mismo pipeline "sin plantilla" que
// usa "Mi Imagen" en el Estudio (studio/generate.ts, la rama sin `form.template`):
// dirección de escena → imagen → recorte al lienzo. NO pasa por
// renderTemplatePiece: esa rama compone precio, dirección, stats y demás
// sobre un `StudioForm` de listado — conceptos que una portada de newsletter
// no tiene. Aquí no hace falta componer nada encima: la página pública ya
// pinta el titular debajo de la imagen (ver
// src/app/(hosted)/nl/[tenantSlug]/[editionSlug]/page.tsx), así
// que la portada es la foto sola, sin texto superpuesto.
//
// El "formulario" que se le pasa al director es sintético: recipe
// 'open_prompt' con un prompt derivado del titular y la bajada de la edición.
// Es la misma receta que usa "Mi Imagen" para pedir cualquier cosa que no sea
// una de las cuatro escenas de listado — aquí el "cualquier cosa" es el tema
// de la edición. `directScene`, `resolveBackground` y `finishFreeImage` se
// REUTILIZAN tal cual: escribir un segundo compositor de imagen para esto
// sería exactamente la duplicación que se quiere evitar.

const COVER_ASPECT = '16:9' as const

// El titular llega desde `newsletter_editions.title` (hasta 200 caracteres) y
// la bajada desde `dek` (hasta 400): sin acotar, el prompt armado podía pasar
// los 800 que exige `openPrompt` en recipes.ts, y ese `.max(800)` no tiene
// mensaje propio — el error que se le mostraría al agente saldría en inglés.
// Se recorta ANTES de armar la plantilla para no depender de ese límite ajeno.
function truncate(value: string, max: number): string {
  const trimmed = value.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed
}

function buildCoverPrompt(title: string, topic: string): string {
  const safeTitle = truncate(title, 160)
  const safeTopic = truncate(topic, 300)
  const eje = safeTopic ? ` El eje de esta edición: "${safeTopic}".` : ''
  return (
    `Portada editorial para un newsletter inmobiliario, formato apaisado. ` +
    `El titular de esta edición es "${safeTitle}".${eje} ` +
    `Quiero una fotografía o escena que transmita ese tema con un tono premium, ` +
    `sereno y profesional — sin texto, letras ni logotipos visibles en la imagen.`
  ).slice(0, 800)
}

/**
 * Genera la portada de una edición con IA y la sube a `newsletter-media`.
 *
 * Se llama DESPUÉS de tener el texto final (título y bajada reales), no antes:
 * la escena tiene que reflejar el titular que de verdad se va a publicar. Best
 * effort de principio a fin — nunca lanza, siempre `{ ok }`.
 */
export async function generateCover(args: {
  ctx:   TenantContext
  title: string
  topic: string
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { ctx, title, topic } = args
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant antes de generar' }

  // El gate va ANTES de gastar nada, mismo orden que studio/generate.ts.
  const blocked = await assertAiWithinLimit(ctx, 'newsletter_cover')
  if (blocked) return blocked

  try {
    // Sin agente: la portada es de la edición, no de un agente en particular.
    const brand = await getStudioBrand(ctx.tenant_id, null)

    const parsedForm = parseStudioForm({
      recipe: 'open_prompt',
      prompt: buildCoverPrompt(title, topic),
      aspect: COVER_ASPECT,
    })
    if (!parsedForm.ok) return { ok: false, error: parsedForm.error }
    const form = parsedForm.data

    // 1. Dirección de escena. El costo se registra pase lo que pase después:
    // el token ya se facturó aunque la generación de imagen degrade.
    const direction = await directScene({ form, brand })
    await recordAiUsage({
      tenantId: ctx.tenant_id,
      userId:   ctx.user_id,
      feature:  'newsletter_cover',
      model:    DIRECTOR_MODEL,
      usage:    direction.usage,
      metadata: { step: 'direction', title },
    })

    // 2. Imagen. Sin propiedad ni referencias: la portada es 100% generada.
    const bg = await resolveBackground({
      sourceMode:  'generate',
      scenePrompt: direction.direction.scene_prompt,
      references:  [],
      photoUrl:    null,
    })

    // A diferencia del Estudio (donde un fondo degradado a un gradiente de
    // marca sigue siendo una pieza publicable porque el texto va encima), aquí
    // NO hay nada que componer sobre la imagen: un gradiente liso presentado
    // como "portada generada" sería un resultado roto, no degradado. Se
    // reporta como fallo para que el editor pueda reintentar.
    if (bg.source !== 'generated') {
      return { ok: false, error: bg.warning ? `No se pudo generar la portada: ${bg.warning}` : 'No se pudo generar la portada.' }
    }

    await recordAiUsage({
      tenantId: ctx.tenant_id,
      userId:   ctx.user_id,
      feature:  'newsletter_cover',
      model:    bg.model ?? 'nano-banana',
      usage:    {},
      costUsdOverride: IMAGE_UNIT_COST_USD,
      metadata: { step: 'image', title },
    })

    const { width, height } = CANVAS[COVER_ASPECT]
    const png = await finishFreeImage({ background: bg.buffer, accent: brand.primary_color, width, height })

    const path = `${ctx.tenant_id}/${crypto.randomUUID()}.png`
    const db = createAdminClient()
    const { error } = await db.storage
      .from('newsletter-media')
      .upload(path, new Blob([new Uint8Array(png)], { type: 'image/png' }), { contentType: 'image/png', upsert: false })
    if (error) return { ok: false, error: `No se pudo subir la portada: ${error.message}` }

    const { data } = db.storage.from('newsletter-media').getPublicUrl(path)
    return { ok: true, url: data.publicUrl }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo generar la portada' }
  }
}
