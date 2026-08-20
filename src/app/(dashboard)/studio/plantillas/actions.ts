'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { canUseStudio } from '@/lib/access/studio'
import { saveTemplate, saveTemplateThumb, listTemplates } from '@/lib/data/studio-templates'
import { buildTemplateDocument } from '@/lib/studio/templates/document'
import { templateValues, templateRawValues, templateFlags, paletteVars } from '@/lib/studio/templates/values'
import { samplePropsInlined } from '@/lib/studio/sample-data.server'
import { listMockupOverrides, saveMockup, deleteMockup } from '@/lib/data/studio-mockups'
import { resolveMockups, mockupSlot } from '@/lib/studio/mockups'
import { renderDocument } from '@/lib/studio/render/client'
import { CANVAS } from '@/lib/studio/canvas'
import type { ActionResult, StudioRecipe, Aspect } from '@/lib/studio/types'

// El guardia se repite aquí aunque la ruta ya lo tenga: una server action es un
// endpoint HTTP y se puede invocar directamente.

const schema = z.object({
  key:     z.string().trim().min(1, 'La clave es obligatoria')
            .regex(/^[a-z0-9-]+$/, 'La clave solo admite minúsculas, números y guiones'),
  label:   z.string().trim().min(1, 'El nombre es obligatorio').max(40),
  hint:    z.string().trim().max(60).default(''),
  recipes: z.array(z.enum(['open_house', 'new_listing', 'sold', 'event'])).min(1, 'Elige al menos una receta'),
  aspects: z.array(z.enum(['4:5', '1:1', '9:16'])).min(1),
  html:    z.string().max(200_000),
  css:     z.string().max(200_000),
})

export async function saveTemplateAction(input: unknown): Promise<ActionResult<{ key: string; thumbUrl: string | null }>> {
  const ctx = await getCurrentTenantContext()
  if (!canUseStudio(ctx)) return { ok: false, error: 'Acceso no autorizado' }

  const parsed = schema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'El formulario tiene datos inválidos' }
  }
  const data = parsed.data

  try {
    await saveTemplate(data)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo guardar el diseño' }
  }

  // La miniatura se genera aquí, con el escenario completo de la primera receta
  // que el diseño declara. Si falla, el diseño YA está guardado: se avisa y no
  // se pierde el trabajo.
  let thumbUrl: string | null = null
  try {
    const aspect = data.aspects[0] as Aspect
    const { width, height } = CANVAS[aspect]
    // La miniatura se dibuja con las MISMAS imágenes que el autor está viendo
    // en el editor: si subió su propia foto, la tarjeta del selector la enseña.
    const imagenes = resolveMockups(await listMockupOverrides())
    const props = await samplePropsInlined(data.recipes[0] as StudioRecipe, 'completo', imagenes)
    const document = buildTemplateDocument({
      html: data.html, css: data.css,
      values: templateValues(props), rawValues: templateRawValues(props),
      vars: paletteVars(props.palette), flags: templateFlags(props),
      fontFaceCss: '', width, height,
    })
    const png = await renderDocument(document, { width, height })
    await saveTemplateThumb(data.key, png)
    thumbUrl = (await listTemplates()).find(t => t.key === data.key)?.thumbUrl ?? null
  } catch (e) {
    const detalle = e instanceof Error ? e.message : 'error desconocido'
    revalidatePath('/studio')
    return { ok: false, error: `El diseño se guardó, pero la miniatura falló: ${detalle}` }
  }

  revalidatePath('/studio')
  revalidatePath('/studio/plantillas')
  return { ok: true, data: { key: data.key, thumbUrl } }
}

const MAX_MOCKUP_BYTES = 10 * 1024 * 1024

/**
 * Sube una imagen de ejemplo para un hueco del diseño.
 *
 * Recibe FormData porque viaja un archivo. Devuelve la URL ya versionada para
 * que la vista previa cambie sin recargar: el bucket sirve por ruta fija, así
 * que sin la versión el navegador seguiría enseñando la imagen anterior.
 */
export async function saveMockupAction(formData: FormData): Promise<ActionResult<{ key: string; url: string }>> {
  const ctx = await getCurrentTenantContext()
  if (!canUseStudio(ctx)) return { ok: false, error: 'Acceso no autorizado' }

  const key = formData.get('key')
  if (typeof key !== 'string' || !mockupSlot(key)) {
    return { ok: false, error: 'Ese hueco de imagen no existe' }
  }

  const archivo = formData.get('imagen')
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, error: 'No llegó ninguna imagen' }
  }
  if (!archivo.type.startsWith('image/')) {
    return { ok: false, error: 'El archivo tiene que ser una imagen' }
  }
  if (archivo.size > MAX_MOCKUP_BYTES) {
    return { ok: false, error: 'La imagen supera los 10 MB' }
  }

  try {
    const url = await saveMockup(key, Buffer.from(await archivo.arrayBuffer()))
    revalidatePath('/studio/plantillas')
    return { ok: true, data: { key, url } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo subir la imagen' }
  }
}

/** Quita la imagen subida y devuelve el hueco a la de reserva del repo. */
export async function deleteMockupAction(key: string): Promise<ActionResult<{ key: string; url: string }>> {
  const ctx = await getCurrentTenantContext()
  if (!canUseStudio(ctx)) return { ok: false, error: 'Acceso no autorizado' }

  const slot = mockupSlot(key)
  if (!slot) return { ok: false, error: 'Ese hueco de imagen no existe' }

  try {
    await deleteMockup(key)
    revalidatePath('/studio/plantillas')
    return { ok: true, data: { key, url: slot.fallback } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'No se pudo quitar la imagen' }
  }
}
