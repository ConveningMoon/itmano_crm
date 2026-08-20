import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAiWithinLimit } from '@/lib/services/ai-limit'
import { recordAiUsage, computeCostUsd, IMAGE_UNIT_COST_USD } from '@/lib/services/ai-usage'
import { getStudioBrand, getStudioImage, getPropertyOptions, getAgentOptions, STUDIO_BUCKET } from '@/lib/data/studio'
import { directScene, DIRECTOR_MODEL } from './prompt-director'
import { resolveBackground } from './background'
import { composeStudioImage } from './compositor'
import { buildTemplateProps } from './template-props'
import { paletteRow } from './palettes'
import { findTemplate } from './templates/registry'
import { renderToPng } from './render/satori'
import { CANVAS } from './canvas'
import { usesAi, type StudioForm } from './recipes'
import type { ActionResult, StudioImage, TextZone } from './types'
import type { TenantContext } from '@/lib/auth/tenant-context'

// ── Pipeline del Estudio ─────────────────────────────────────────────────────
// Vive fuera de actions.ts porque un archivo 'use server' convierte cada export
// en un endpoint HTTP — misma razón por la que existe carousels/render.ts.
//
// Orden deliberado: validar (ya lo hizo el llamador) → gate de IA → fila →
// dirección → escena → composición → subida. El gate va ANTES de gastar nada.

async function uploadPng(path: string, png: Buffer): Promise<string> {
  const { error } = await createAdminClient().storage
    .from(STUDIO_BUCKET)
    .upload(path, new Blob([new Uint8Array(png)], { type: 'image/png' }), { contentType: 'image/png', upsert: true })
  if (error) throw new Error(`Storage: ${error.message}`)
  return path
}

async function fail(id: string, message: string): Promise<{ ok: false; error: string }> {
  await createAdminClient().from('studio_images')
    .update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
    .eq('id', id)
  return { ok: false, error: message }
}

/** La primera foto utilizable de una propiedad del tenant, o null. */
async function firstPhotoUrl(tenantId: string, propertyId: string): Promise<string | null> {
  const options = await getPropertyOptions(tenantId)
  return options.find(p => p.id === propertyId)?.photos[0] ?? null
}

/**
 * Renderiza una pieza con template. No persiste nada y no llama a ninguna IA:
 * las fotos son las reales de la propiedad y el texto sale del formulario. Por
 * eso la previsualización puede ser gratis e ilimitada.
 */
export async function renderTemplatePiece(params: {
  ctx:  TenantContext
  form: StudioForm
  /** La escena generada, cuando la pieza no salió de una propiedad del CRM. */
  generatedHero?: Buffer | null
}): Promise<Buffer> {
  const { ctx, form } = params
  if (!ctx.tenant_id) throw new Error('Selecciona un tenant antes de renderizar')
  if (!form.template) throw new Error('La pieza no tiene diseño')

  const template = findTemplate(form.template)
  if (!template) throw new Error('Ese diseño no existe')

  const [brand, properties, agents] = await Promise.all([
    getStudioBrand(ctx.tenant_id, form.agent_id ?? null),
    getPropertyOptions(ctx.tenant_id),
    getAgentOptions(ctx.tenant_id),
  ])

  const photoUrls = form.property_id
    ? (properties.find(p => p.id === form.property_id)?.photos ?? [])
    : []

  const agent = form.agent_id ? agents.find(a => a.id === form.agent_id) : undefined
  const agentPhoto = agent?.cover_photo_url
    ? { url: agent.cover_photo_url, cutout: agent.cover_photo_cutout }
    : null

  const props = await buildTemplateProps({ form, brand, photoUrls, agentPhoto, generatedHero: params.generatedHero })
  const { width, height } = CANVAS[form.aspect]
  return renderToPng(template.render(props), { width, height })
}

export async function generateStudioImage(params: {
  ctx:        TenantContext
  form:       StudioForm
  references: Array<{ data: Buffer; mimeType: string }>
  /** La imagen principal subida a mano, cuando la hay. Gana sobre la escena
   *  generada: si el agente ya tiene la foto, no hay nada que inventar. */
  heroUpload?: Buffer | null
}): Promise<ActionResult<StudioImage>> {
  const { ctx, form } = params
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant antes de generar' }

  // El gate va ANTES de gastar nada, y solo cuando de verdad se va a gastar:
  // con propiedad elegida —o con la foto subida a mano— no cuesta.
  if (!params.heroUpload && usesAi(form)) {
    const blocked = await assertAiWithinLimit(ctx)
    if (blocked) return blocked
  }

  const db = createAdminClient()
  const brand = await getStudioBrand(ctx.tenant_id, form.agent_id ?? null)

  const { data: row, error: insErr } = await db.from('studio_images').insert({
    template:       form.template ?? null,
    tenant_id:      ctx.tenant_id,
    agent_id:       form.agent_id ?? null,
    created_by:     ctx.user_id,
    recipe:         form.recipe,
    property_id:    form.property_id ?? null,
    form_json:      form,
    source_mode:    form.source_mode,
    style:          form.style,
    // La columna es text[]: los roles van en form_json (jsonb). Ver paletteRow.
    palette:        paletteRow(form.palette),
    aspect:         form.aspect,
    reference_role: form.reference_role ?? null,
    status:         'generating',
  }).select('id').single()
  if (insErr || !row) return { ok: false, error: `No se pudo registrar la imagen: ${insErr?.message ?? 'error'}` }

  const id = row.id as string
  const base = `${ctx.tenant_id}/${id}`
  let costUsd = 0

  try {
    // ── Camino con diseño ────────────────────────────────────────────────────
    // El texto y el layout los pone el diseño. La única pregunta es de dónde
    // sale la foto: de la propiedad elegida (gratis) o de la IA, cuando el
    // agente escribió cómo tiene que verse porque no hay propiedad.
    if (form.template) {
      // La foto subida gana: ya está, no hay nada que generar ni que cobrar.
      let hero: Buffer | null = params.heroUpload ?? null
      let scenePrompt: string | null = null

      if (!hero && usesAi(form)) {
        const direction = await directScene({ form, brand })
        scenePrompt = direction.direction.scene_prompt
        costUsd += computeCostUsd(DIRECTOR_MODEL, direction.usage)
        await recordAiUsage({
          tenantId: ctx.tenant_id, userId: ctx.user_id, feature: 'studio_prompt',
          model: DIRECTOR_MODEL, usage: direction.usage,
          metadata: { studio_image_id: id, recipe: form.recipe },
        })

        const bg = await resolveBackground({
          sourceMode: 'generate', scenePrompt, references: params.references, photoUrl: null,
        })
        hero = bg.buffer
        if (bg.source === 'generated') {
          costUsd += IMAGE_UNIT_COST_USD
          await recordAiUsage({
            tenantId: ctx.tenant_id, userId: ctx.user_id, feature: 'studio_image',
            model: bg.model ?? 'nano-banana', usage: {}, costUsdOverride: IMAGE_UNIT_COST_USD,
            metadata: { studio_image_id: id, recipe: form.recipe },
          })
        }
      }

      const png = await renderTemplatePiece({ ctx, form, generatedHero: hero })
      const renderedPath = await uploadPng(`${base}/final.png`, png)
      // La escena se guarda aparte: es la que reusa "Recomponer" para no volver
      // a pagarla cuando lo que hay que corregir es un texto.
      const backgroundPath = hero ? await uploadPng(`${base}/bg.png`, hero) : null

      await db.from('studio_images').update({
        rendered_path:   renderedPath,
        background_path: backgroundPath,
        scene_prompt:    scenePrompt,
        status:          'ready',
        error_message:   null,
        cost_usd:        Math.round(costUsd * 1_000_000) / 1_000_000,
        updated_at:      new Date().toISOString(),
      }).eq('id', id)

      const ready = await getStudioImage(id)
      return ready ? { ok: true, data: ready } : { ok: false, error: 'La imagen se generó pero no se pudo leer' }
    }

    // Las referencias se guardan ANTES de usarse: si algo falla después, queda
    // el rastro de con qué se pidió.
    const referencePaths: string[] = []
    for (const [i, ref] of params.references.entries()) {
      referencePaths.push(await uploadPng(`${base}/ref-${i}.png`, ref.data))
    }

    // 1. Dirección de escena (solo en modo generate).
    let scenePrompt: string | null = null
    let textZone: TextZone = 'bottom'
    if (form.source_mode === 'generate') {
      const direction = await directScene({ form, brand })
      scenePrompt = direction.direction.scene_prompt
      textZone = direction.direction.text_zone
      costUsd += computeCostUsd(DIRECTOR_MODEL, direction.usage)
      await recordAiUsage({
        tenantId: ctx.tenant_id, userId: ctx.user_id, feature: 'studio_prompt',
        model: DIRECTOR_MODEL, usage: direction.usage,
        metadata: { studio_image_id: id, recipe: form.recipe },
      })
    }

    // 2. Fondo.
    const photoUrl = form.property_id ? await firstPhotoUrl(ctx.tenant_id, form.property_id) : null
    const bg = await resolveBackground({
      sourceMode:  form.source_mode,
      scenePrompt,
      references:  params.references,
      photoUrl,
    })

    let backgroundPath: string | null = null
    if (bg.buffer) backgroundPath = await uploadPng(`${base}/bg.png`, bg.buffer)

    if (bg.source === 'generated') {
      costUsd += IMAGE_UNIT_COST_USD
      await recordAiUsage({
        tenantId: ctx.tenant_id, userId: ctx.user_id, feature: 'studio_image',
        model: bg.model ?? 'nano-banana', usage: {}, costUsdOverride: IMAGE_UNIT_COST_USD,
        metadata: { studio_image_id: id, recipe: form.recipe },
      })
    }

    // 3. Composición.
    await db.from('studio_images').update({ status: 'composing', updated_at: new Date().toISOString() }).eq('id', id)
    const png = await composeStudioImage({ form, brand, background: bg.buffer, textZone })
    const renderedPath = await uploadPng(`${base}/final.png`, png)

    await db.from('studio_images').update({
      // `reference_path` repite la primera: las lecturas viejas siguen viendo lo
      // que esperan y la lista completa vive en `reference_paths` (migración 102).
      reference_path:  referencePaths[0] ?? null,
      reference_paths: referencePaths.length ? referencePaths : null,
      scene_prompt:    scenePrompt,
      text_zone:       textZone,
      background_path: backgroundPath,
      rendered_path:   renderedPath,
      status:          'ready',
      // Nota, no error: el fondo degradó pero la pieza salió igual.
      error_message:   bg.warning ? `Fondo ${bg.source}: ${bg.warning}` : null,
      cost_usd:        Math.round(costUsd * 1_000_000) / 1_000_000,
      updated_at:      new Date().toISOString(),
    }).eq('id', id)

    const fresh = await getStudioImage(id)
    return fresh ? { ok: true, data: fresh } : { ok: false, error: 'La imagen se generó pero no se pudo leer' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido'
    console.error(JSON.stringify({ service: 'studio', step: 'generate', id, message: msg }))
    return fail(id, msg)
  }
}

/**
 * Vuelve a componer el texto sobre el fondo YA generado, sin volver a pagar la
 * escena. Es el arreglo barato cuando el precio o la fecha salieron mal: mismo
 * criterio de reutilización que renderOneSlide en los carruseles.
 */
export async function recomposeStudioImage(
  id: string, ctx: TenantContext, form: StudioForm,
): Promise<ActionResult<StudioImage>> {
  const existing = await getStudioImage(id)
  if (!existing) return { ok: false, error: 'La imagen no existe' }
  if (ctx.role !== 'super_admin' && existing.tenant_id !== ctx.tenant_id) {
    return { ok: false, error: 'Acceso no autorizado' }
  }

  const db = createAdminClient()
  try {
    // Con diseño se vuelve a dibujar entero, pero la escena ya pagada se reusa:
    // recomponer existe para arreglar un texto sin volver a pasar por la IA.
    if (form.template) {
      let hero: Buffer | null = null
      if (existing.background_path) {
        const { data: blob } = await db.storage.from(STUDIO_BUCKET).download(existing.background_path)
        if (blob) hero = Buffer.from(await blob.arrayBuffer())
      }
      const png = await renderTemplatePiece({ ctx, form, generatedHero: hero })
      const renderedPath = await uploadPng(`${existing.tenant_id}/${id}/final.png`, png)
      await db.from('studio_images').update({
        form_json: form, template: form.template, rendered_path: renderedPath,
        status: 'ready', error_message: null, updated_at: new Date().toISOString(),
      }).eq('id', id)
      const ready = await getStudioImage(id)
      return ready ? { ok: true, data: ready } : { ok: false, error: 'No se pudo leer la imagen recompuesta' }
    }

    let bg: Buffer | null = null
    if (existing.background_path) {
      const { data: blob } = await db.storage.from(STUDIO_BUCKET).download(existing.background_path)
      if (blob) bg = Buffer.from(await blob.arrayBuffer())
    }

    const brand = await getStudioBrand(existing.tenant_id, form.agent_id ?? null)
    const png = await composeStudioImage({ form, brand, background: bg, textZone: existing.text_zone ?? 'bottom' })
    const renderedPath = await uploadPng(`${existing.tenant_id}/${id}/final.png`, png)

    await db.from('studio_images').update({
      form_json:     form,
      rendered_path: renderedPath,
      status:        'ready',
      error_message: null,
      updated_at:    new Date().toISOString(),
    }).eq('id', id)

    const fresh = await getStudioImage(id)
    return fresh ? { ok: true, data: fresh } : { ok: false, error: 'No se pudo leer la imagen recompuesta' }
  } catch (e) {
    return fail(id, e instanceof Error ? e.message : 'Error desconocido')
  }
}
