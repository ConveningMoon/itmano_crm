import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertAiWithinLimit } from '@/lib/services/ai-limit'
import { recordAiUsage, computeCostUsd, IMAGE_UNIT_COST_USD } from '@/lib/services/ai-usage'
import { getStudioBrand, getStudioImage, getPropertyOptions, STUDIO_BUCKET } from '@/lib/data/studio'
import { directScene, DIRECTOR_MODEL } from './prompt-director'
import { resolveBackground } from './background'
import { composeStudioImage } from './compositor'
import type { StudioForm } from './recipes'
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

export async function generateStudioImage(params: {
  ctx:       TenantContext
  form:      StudioForm
  reference: { data: Buffer; mimeType: string } | null
}): Promise<ActionResult<StudioImage>> {
  const { ctx, form } = params
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant antes de generar' }

  // 'photo' no llama a ninguna IA, así que tampoco consume presupuesto.
  if (form.source_mode === 'generate') {
    const blocked = await assertAiWithinLimit(ctx)
    if (blocked) return blocked
  }

  const db = createAdminClient()
  const brand = await getStudioBrand(ctx.tenant_id, form.agent_id ?? null)

  const { data: row, error: insErr } = await db.from('studio_images').insert({
    tenant_id:      ctx.tenant_id,
    agent_id:       form.agent_id ?? null,
    created_by:     ctx.user_id,
    recipe:         form.recipe,
    property_id:    form.property_id ?? null,
    form_json:      form,
    source_mode:    form.source_mode,
    style:          form.style,
    palette:        form.palette,
    aspect:         form.aspect,
    reference_role: form.reference_role ?? null,
    status:         'generating',
  }).select('id').single()
  if (insErr || !row) return { ok: false, error: `No se pudo registrar la imagen: ${insErr?.message ?? 'error'}` }

  const id = row.id as string
  const base = `${ctx.tenant_id}/${id}`
  let costUsd = 0

  try {
    // La referencia se guarda ANTES de usarse: si algo falla después, queda el
    // rastro de con qué se pidió.
    let referencePath: string | null = null
    if (params.reference) {
      referencePath = await uploadPng(`${base}/ref.png`, params.reference.data)
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
      reference:   params.reference,
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
      reference_path:  referencePath,
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
