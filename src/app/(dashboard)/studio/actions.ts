'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStudioForm, requireTemplate, validateTemplateChoice, referenceCount, usesAi, MAX_REFERENCES } from '@/lib/studio/recipes'
import { generateStudioImage, recomposeStudioImage, renderTemplatePiece } from '@/lib/studio/generate'
import { getStudioImage, STUDIO_BUCKET } from '@/lib/data/studio'
import { listTemplates } from '@/lib/data/studio-templates'
import type { ActionResult, StudioImage } from '@/lib/studio/types'

// Cada action repite el guardia: la ruta no es la única puerta — una server
// action es un endpoint HTTP y se puede invocar directamente.
async function gate() {
  const ctx = await getCurrentTenantContext()
  return canUseStudio(ctx) ? ctx : null
}

const MAX_REFERENCE_BYTES = 8 * 1024 * 1024

/**
 * La imagen principal subida a mano.
 *
 * Es la tercera forma de llenar ese hueco, junto a las fotos de la propiedad y
 * la escena generada. Existe porque un agente que YA tiene la foto no debería
 * pagar por que un modelo se la invente ni tener que dar de alta una propiedad
 * para publicar un evento.
 */
async function readHero(formData: FormData): Promise<{ ok: true; data: Buffer | null } | { ok: false; error: string }> {
  const file = formData.get('hero')
  if (!(file instanceof File) || file.size === 0) return { ok: true, data: null }
  if (file.size > MAX_REFERENCE_BYTES) return { ok: false, error: 'La imagen principal supera los 8 MB' }
  if (!file.type.startsWith('image/')) return { ok: false, error: 'La imagen principal debe ser una imagen' }
  return { ok: true, data: Buffer.from(await file.arrayBuffer()) }
}

/**
 * Genera una imagen. Recibe FormData porque la referencia es un archivo; el
 * resto del formulario viaja como JSON en el campo `payload`.
 */
export async function createStudioImage(formData: FormData): Promise<ActionResult<StudioImage>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Acceso no autorizado' }

  const raw = formData.get('payload')
  if (typeof raw !== 'string') return { ok: false, error: 'Faltan los datos del formulario' }

  let parsedJson: unknown
  try { parsedJson = JSON.parse(raw) } catch { return { ok: false, error: 'Los datos del formulario no son válidos' } }

  const parsed = parseStudioForm(parsedJson)
  if (!parsed.ok) return parsed

  const metas = await listTemplates()
  const malaEleccion = validateTemplateChoice(parsed.data, metas)
  if (malaEleccion) return malaEleccion

  // Solo al CREAR: las piezas viejas sin diseño siguen recomponiéndose.
  const noTemplate = requireTemplate(parsed.data, metas)
  if (noTemplate) return noTemplate

  const hero = await readHero(formData)
  if (!hero.ok) return hero

  const files = formData.getAll('reference').filter((f): f is File => f instanceof File && f.size > 0)
  if (files.length > MAX_REFERENCES) {
    return { ok: false, error: `Como máximo ${MAX_REFERENCES} imágenes de referencia` }
  }

  const references: Array<{ data: Buffer; mimeType: string }> = []
  for (const file of files) {
    if (file.size > MAX_REFERENCE_BYTES) return { ok: false, error: `"${file.name}" supera los 8 MB` }
    if (!file.type.startsWith('image/')) return { ok: false, error: `"${file.name}" no es una imagen` }
    references.push({ data: Buffer.from(await file.arrayBuffer()), mimeType: file.type })
  }
  // El formulario declara cuántas adjuntó; si los archivos no llegaron, generar
  // igual produciría una imagen que no es la que el agente pidió.
  if (referenceCount(parsed.data) !== references.length) {
    return { ok: false, error: 'No llegaron las imágenes de referencia' }
  }

  const result = await generateStudioImage({ ctx, form: parsed.data, references, heroUpload: hero.data })
  if (result.ok) revalidatePath('/studio')
  return result
}

export async function recomposeImage(id: string, payload: unknown): Promise<ActionResult<StudioImage>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Acceso no autorizado' }

  const parsed = parseStudioForm(payload)
  if (!parsed.ok) return parsed

  const result = await recomposeStudioImage(id, ctx, parsed.data)
  if (result.ok) revalidatePath('/studio')
  return result
}

/**
 * Genera una VARIANTE: reusa el mismo formulario y crea una fila nueva, sin
 * pisar la anterior — comparar dos intentos es el uso normal. La referencia se
 * vuelve a bajar del bucket para que la variante sea un reintento fiel.
 */
export async function regenerateStudioImage(id: string): Promise<ActionResult<StudioImage>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Acceso no autorizado' }

  const source = await getStudioImage(id)
  if (!source) return { ok: false, error: 'La imagen no existe' }
  if (ctx.role !== 'super_admin' && source.tenant_id !== ctx.tenant_id) {
    return { ok: false, error: 'Acceso no autorizado' }
  }

  const parsed = parseStudioForm(source.form_json)
  if (!parsed.ok) return { ok: false, error: `El formulario original ya no es válido: ${parsed.error}` }

  const storage = createAdminClient().storage.from(STUDIO_BUCKET)
  const references: Array<{ data: Buffer; mimeType: string }> = []
  for (const path of source.reference_paths) {
    const { data: blob } = await storage.download(path)
    if (blob) references.push({ data: Buffer.from(await blob.arrayBuffer()), mimeType: 'image/png' })
  }

  const result = await generateStudioImage({ ctx, form: parsed.data, references })
  if (result.ok) revalidatePath('/studio')
  return result
}

export async function deleteStudioImage(id: string): Promise<ActionResult<{ id: string }>> {
  const ctx = await gate()
  if (!ctx) return { ok: false, error: 'Acceso no autorizado' }

  const image = await getStudioImage(id)
  if (!image) return { ok: false, error: 'La imagen no existe' }
  if (ctx.role !== 'super_admin' && image.tenant_id !== ctx.tenant_id) {
    return { ok: false, error: 'Acceso no autorizado' }
  }

  const db = createAdminClient()
  const paths = [...image.reference_paths, image.background_path, image.rendered_path]
    .filter((p): p is string => !!p)
  if (paths.length) await db.storage.from(STUDIO_BUCKET).remove(paths)

  const { error } = await db.from('studio_images').delete().eq('id', id)
  if (error) return { ok: false, error: `No se pudo borrar: ${error.message}` }

  revalidatePath('/studio')
  return { ok: true, data: { id } }
}

/**
 * Renderiza y devuelve la imagen SIN escribir en la base ni en el bucket.
 *
 * Solo existe en la ruta con diseño, que no llama a ninguna IA: ahí probar es
 * gratis y el agente puede saltar entre diseños hasta dar con el que quiere. Con
 * escena generada previsualizar costaría dinero, así que ese camino sigue
 * creando la fila directamente.
 *
 * Sin esta separación, mirar los tres diseños dejaría tres filas de basura en la
 * biblioteca.
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
    return { ok: false, error: 'La previsualización solo existe para las piezas con diseño' }
  }
  // Previsualizar es gratis e ilimitado justo porque no llama a nada. Con una
  // escena generada, cada vista costaría dinero.
  if (usesAi(parsed.data)) {
    return { ok: false, error: 'Con escena generada no hay previsualización: cada intento tiene costo' }
  }

  const hero = await readHero(formData)
  if (!hero.ok) return hero

  try {
    const { png } = await renderTemplatePiece({ ctx, form: parsed.data, generatedHero: hero.data })
    return { ok: true, data: { dataUri: `data:image/png;base64,${png.toString('base64')}` } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo previsualizar' }
  }
}
