import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { inferSlots } from '@/lib/studio/templates/slots'
import { STUDIO_BUCKET, publicUrl } from './studio'
import type { TemplateMeta } from '@/lib/studio/templates/meta'
import type { StudioRecipe, Aspect } from '@/lib/studio/types'

// Lecturas y escrituras del catálogo de diseños. Sustituye a
// templates/registry.ts: lo que era un array de módulos importados es ahora una
// tabla, y lo que viaja al cliente es TemplateMeta — dato, sin función.

export interface TemplateRecord extends TemplateMeta {
  html: string
  css:  string
}

const META_COLUMNS = columns('studio_templates', [
  'key', 'label', 'hint', 'recipes', 'aspects', 'slots', 'ideal_photos', 'thumb_path',
])

const FULL_COLUMNS = columns('studio_templates', [
  'key', 'label', 'hint', 'recipes', 'aspects', 'slots', 'ideal_photos', 'thumb_path', 'html', 'css',
])

/** Pura a propósito: es lo único de este archivo que se puede testear sin BD. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: el cliente de Supabase no está tipado en este repo; la lista de columnas ya se valida con columns()
export function toTemplateMeta(r: any): TemplateMeta {
  const slots = r.slots ?? {}
  return {
    key:         r.key,
    label:       r.label,
    hint:        r.hint ?? '',
    recipes:     (r.recipes ?? []) as StudioRecipe[],
    aspects:     (r.aspects ?? ['4:5']) as Aspect[],
    slots:       { required: slots.required ?? [], optional: slots.optional ?? [] },
    idealPhotos: r.ideal_photos ?? 0,
    thumbUrl:    publicUrl(r.thumb_path ?? null),
  }
}

/** El catálogo, en orden estable: el agente encuentra cada diseño donde estaba. */
export async function listTemplates(): Promise<TemplateMeta[]> {
  const { data, error } = await createAdminClient()
    .from('studio_templates').select(META_COLUMNS).order('key')
  if (error) throw new Error(`No se pudo leer el catálogo de diseños: ${error.message}`)
  return (data ?? []).map(toTemplateMeta)
}

export async function getTemplate(key: string): Promise<TemplateRecord | null> {
  const { data, error } = await createAdminClient()
    .from('studio_templates').select(FULL_COLUMNS).eq('key', key).maybeSingle()
  if (error) throw new Error(`No se pudo leer el diseño: ${error.message}`)
  if (!data) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: ídem
  const row = data as any
  return { ...toTemplateMeta(row), html: row.html ?? '', css: row.css ?? '' }
}

/**
 * Crea o actualiza un diseño. `slots` e `ideal_photos` NO se reciben: se
 * infieren del html en este mismo paso, que es lo que impide que la declaración
 * y el diseño se separen.
 */
export async function saveTemplate(input: {
  key: string; label: string; hint: string
  recipes: string[]; aspects: string[]
  html: string; css: string
}): Promise<void> {
  const { required, optional, idealPhotos } = inferSlots(input.html)
  const { error } = await createAdminClient().from('studio_templates').upsert({
    key:          input.key,
    label:        input.label,
    hint:         input.hint,
    recipes:      input.recipes,
    aspects:      input.aspects,
    html:         input.html,
    css:          input.css,
    slots:        { required, optional },
    ideal_photos: idealPhotos,
    updated_at:   new Date().toISOString(),
  }, { onConflict: 'key' })
  if (error) throw new Error(`No se pudo guardar el diseño: ${error.message}`)
}

/** Sube la miniatura y deja su path en la fila. */
export async function saveTemplateThumb(key: string, png: Buffer): Promise<string> {
  const path = `templates/${key}.png`
  const db = createAdminClient()
  const { error } = await db.storage.from(STUDIO_BUCKET)
    .upload(path, new Blob([new Uint8Array(png)], { type: 'image/png' }), {
      contentType: 'image/png', upsert: true,
    })
  if (error) throw new Error(`No se pudo subir la miniatura: ${error.message}`)
  const { error: updateError } = await db.from('studio_templates')
    .update({ thumb_path: path, updated_at: new Date().toISOString() }).eq('key', key)
  if (updateError) throw new Error(`No se pudo guardar la miniatura en el diseño: ${updateError.message}`)
  return path
}
