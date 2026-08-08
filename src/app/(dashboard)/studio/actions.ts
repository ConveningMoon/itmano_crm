'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseStudioForm } from '@/lib/studio/recipes'
import { generateStudioImage, recomposeStudioImage } from '@/lib/studio/generate'
import { getStudioImage, STUDIO_BUCKET } from '@/lib/data/studio'
import type { ActionResult, StudioImage } from '@/lib/studio/types'

// Cada action repite el guardia: la ruta no es la única puerta — una server
// action es un endpoint HTTP y se puede invocar directamente.
async function gate() {
  const ctx = await getCurrentTenantContext()
  return canUseStudio(ctx) ? ctx : null
}

const MAX_REFERENCE_BYTES = 8 * 1024 * 1024

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

  let reference: { data: Buffer; mimeType: string } | null = null
  const file = formData.get('reference')
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_REFERENCE_BYTES) return { ok: false, error: 'La imagen de referencia supera los 8 MB' }
    if (!file.type.startsWith('image/')) return { ok: false, error: 'La referencia debe ser una imagen' }
    reference = { data: Buffer.from(await file.arrayBuffer()), mimeType: file.type }
  }
  // El formulario declara si adjuntó referencia; si el archivo no llegó, el rol
  // sobra y no debe condicionar el prompt.
  if (parsed.data.has_reference && !reference) {
    return { ok: false, error: 'No llegó la imagen de referencia' }
  }

  const result = await generateStudioImage({ ctx, form: parsed.data, reference })
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

  let reference: { data: Buffer; mimeType: string } | null = null
  if (source.reference_path) {
    const { data: blob } = await createAdminClient().storage.from(STUDIO_BUCKET).download(source.reference_path)
    if (blob) reference = { data: Buffer.from(await blob.arrayBuffer()), mimeType: 'image/png' }
  }

  const result = await generateStudioImage({ ctx, form: parsed.data, reference })
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
  const paths = [image.reference_path, image.background_path, image.rendered_path]
    .filter((p): p is string => !!p)
  if (paths.length) await db.storage.from(STUDIO_BUCKET).remove(paths)

  const { error } = await db.from('studio_images').delete().eq('id', id)
  if (error) return { ok: false, error: `No se pudo borrar: ${error.message}` }

  revalidatePath('/studio')
  return { ok: true, data: { id } }
}
