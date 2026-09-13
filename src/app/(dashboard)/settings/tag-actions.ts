'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'
import {
  checkTagName, isValidTagColor, normalizeTagName, slugifyTag, TAG_DESCRIPTION_MAX,
} from '@/lib/leads/tags'

// Administración del CATÁLOGO de etiquetas. Es distinto de etiquetar un lead:
// crear, renombrar o borrar una etiqueta cambia el vocabulario de todo el
// equipo (y desde la 117, a qué secuencia queda enganchada), así que es de
// owner / super_admin. Aplicarla a un lead lo hace cualquier agente sobre los
// leads que le pertenecen — eso vive en leads/[id]/tag-actions.ts.

type Result = { ok: true } | { ok: false; error: string }

const DescriptionSchema = z.string().max(TAG_DESCRIPTION_MAX).optional()

// Contexto de escritura del catálogo: rol con permiso y un tenant concreto.
// Un super_admin sin tenant seleccionado no tiene catálogo que tocar — las
// etiquetas siempre pertenecen a un tenant.
async function tagWriteContext(): Promise<
  { ok: true; tenantId: string } | { ok: false; error: string }
> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied
  if (!ctx.tenant_id) {
    return { ok: false, error: 'Selecciona un tenant para administrar sus etiquetas.' }
  }
  return { ok: true, tenantId: ctx.tenant_id }
}

function revalidateTags() {
  revalidatePath('/settings')
  revalidatePath('/leads')
  // El panel "Por etiqueta" de /emails se calcula desde el catálogo.
  revalidatePath('/emails')
}

export async function createLeadTag(rawName: string, color: string, rawDescription?: string): Promise<Result> {
  const write = await tagWriteContext()
  if (!write.ok) return write

  const check = checkTagName(rawName)
  if (!check.ok) return { ok: false, error: check.error! }
  if (!isValidTagColor(color)) return { ok: false, error: 'Color no válido.' }

  const description = DescriptionSchema.safeParse(rawDescription)
  if (!description.success) return { ok: false, error: `La descripción no puede pasar de ${TAG_DESCRIPTION_MAX} caracteres.` }

  const name = normalizeTagName(rawName)
  const slug = slugifyTag(name)
  const supabase = createAdminClient()

  // La etiqueta nueva va al final del orden actual. `position` no se recalcula:
  // el catálogo por defecto viene espaciado de 10 en 10 (116) justo para que
  // insertar al final no obligue a reescribir las demás filas.
  const { data: last } = await supabase
    .from('lead_tags')
    .select('position')
    .eq('tenant_id', write.tenantId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nextPosition = (((last as any)?.position as number | undefined) ?? 0) + 10

  const { error } = await supabase.from('lead_tags').insert({
    tenant_id:   write.tenantId,
    name,
    slug,
    color,
    description: rawDescription?.trim() || null,
    position:    nextPosition,
  })

  // 23505 = unique_violation. Los dos índices únicos (nombre y slug) dan el
  // mismo mensaje porque para quien mira es el mismo problema.
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ya existe una etiqueta con ese nombre.' }
    return { ok: false, error: error.message }
  }

  revalidateTags()
  return { ok: true }
}

export async function updateLeadTag(
  tagId: string,
  patch: { name?: string; color?: string; description?: string | null; requiresSequence?: boolean },
): Promise<Result> {
  const write = await tagWriteContext()
  if (!write.ok) return write

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const update: Record<string, any> = {}

  if (patch.name !== undefined) {
    const check = checkTagName(patch.name)
    if (!check.ok) return { ok: false, error: check.error! }
    // El slug NO se recalcula al renombrar: es el identificador estable que
    // viaja en la URL de /leads, así que recalcularlo rompería los enlaces
    // guardados y los filtros que alguien tenga abiertos.
    update.name = normalizeTagName(patch.name)
  }

  if (patch.color !== undefined) {
    if (!isValidTagColor(patch.color)) return { ok: false, error: 'Color no válido.' }
    update.color = patch.color
  }

  if (patch.description !== undefined) {
    const parsed = DescriptionSchema.safeParse(patch.description ?? undefined)
    if (!parsed.success) return { ok: false, error: `La descripción no puede pasar de ${TAG_DESCRIPTION_MAX} caracteres.` }
    update.description = patch.description?.trim() || null
  }

  if (patch.requiresSequence !== undefined) {
    // Marcar la etiqueta NO crea la secuencia: sólo declara que debe existir, y
    // la pestaña "Por etiqueta" de /emails muestra los idiomas que faltan. Se
    // separan porque escribir el correo es trabajo de redacción, no un clic.
    update.requires_sequence = patch.requiresSequence
  }

  if (Object.keys(update).length === 0) return { ok: true }

  const { error } = await createAdminClient()
    .from('lead_tags')
    .update(update)
    .eq('id', tagId)
    // El filtro por tenant es la frontera: sin él, un id de otro tenant se
    // podría editar desde acá aunque la página nunca lo muestre.
    .eq('tenant_id', write.tenantId)

  if (error) {
    if (error.code === '23505') return { ok: false, error: 'Ya existe una etiqueta con ese nombre.' }
    return { ok: false, error: error.message }
  }

  revalidateTags()
  return { ok: true }
}

export async function deleteLeadTag(tagId: string): Promise<Result> {
  const write = await tagWriteContext()
  if (!write.ok) return write

  // Las asignaciones caen por `on delete cascade`: borrar la etiqueta la quita
  // de todos los leads que la tenían. El panel muestra ese conteo antes de
  // confirmar, para que no parezca gratis.
  const { error } = await createAdminClient()
    .from('lead_tags')
    .delete()
    .eq('id', tagId)
    .eq('tenant_id', write.tenantId)

  if (error) {
    // 23503 = foreign_key_violation: la etiqueta tiene una secuencia colgada
    // (trigger_tag_id es `on delete restrict`, migración 117). Borrarla en
    // cascada se llevaría el correo escrito; desenganchar es la decisión real.
    if (error.code === '23503') {
      return {
        ok: false,
        error: 'Esta etiqueta tiene una secuencia de email. Bórrala o desactívala primero en Email → Por etiqueta.',
      }
    }
    return { ok: false, error: error.message }
  }

  revalidateTags()
  return { ok: true }
}
