'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { guarded, type ActionResult } from '@/lib/actions/guarded'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor, isRowVisible } from '@/lib/auth/visibility'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import type { FolderKind } from '@/lib/data/folders'

// ─── Carpetas: crear, renombrar, borrar y mover elementos ─────────────────────
//
// Vive fuera de /sources y /emails porque las dos secciones usan exactamente lo
// mismo; `kind` es lo único que cambia.
//
// Modelo de permisos: la carpeta es PERSONAL. No hay guard de rol —un agente
// organiza su propia vista igual que el propietario del equipo— porque nada de
// lo que se escribe aquí es visible para nadie más ni altera un dato del
// negocio. Lo que sí se comprueba es que el elemento que se mete en una carpeta
// sea uno que ese usuario puede ver: sin esa verificación, cualquiera podría
// confirmar la existencia de una fuente ajena metiéndola en una carpeta suya.

const NameSchema = z.string().trim().min(1, 'Ponle un nombre a la carpeta.').max(60, 'Máximo 60 caracteres.')

const KIND_PATH: Record<FolderKind, string> = {
  source:   '/sources',
  sequence: '/emails',
}

/** El nombre ya existe en esa sección: el índice único de la migración 115. */
function isDuplicateName(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

// ─── Crear ────────────────────────────────────────────────────────────────────

async function createFolderImpl(kind: FolderKind, rawName: string): Promise<ActionResult<{ id: string }>> {
  const parsed = NameSchema.safeParse(rawName)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant para organizar en carpetas.' }

  const supabase = createAdminClient()

  // La carpeta nueva va al final: `position` se ordena junto a created_at, así
  // que basta con dejar hueco por encima de la última.
  const { data: last } = await supabase
    .from('folders')
    .select(columns('folders', ['position']))
    .eq('owner_user_id', ctx.user_id)
    .eq('tenant_id', ctx.tenant_id)
    .eq('kind', kind)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from('folders')
    .insert({
      tenant_id:     ctx.tenant_id,
      owner_user_id: ctx.user_id,
      kind,
      name:          parsed.data,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      position:      ((last as any)?.position ?? -1) + 1,
    })
    .select('id')
    .single()

  if (error) {
    if (isDuplicateName(error)) return { ok: false, error: `Ya tienes una carpeta llamada "${parsed.data}".` }
    return { ok: false, error: error.message }
  }

  revalidatePath(KIND_PATH[kind])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, data: { id: (data as any).id as string } }
}

export async function createFolder(kind: FolderKind, name: string): Promise<ActionResult<{ id: string }>> {
  return guarded('createFolder', () => createFolderImpl(kind, name))
}

// ─── Renombrar ────────────────────────────────────────────────────────────────

async function renameFolderImpl(folderId: string, rawName: string): Promise<ActionResult<null>> {
  const parsed = NameSchema.safeParse(rawName)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const ctx = await requireTenantContext()
  const supabase = createAdminClient()

  // El filtro por dueño va en el UPDATE, no en una lectura previa: con el
  // cliente admin, RLS no protege y una comprobación aparte deja una ventana
  // entre el chequeo y la escritura.
  const { data, error } = await supabase
    .from('folders')
    .update({ name: parsed.data })
    .eq('id', folderId)
    .eq('owner_user_id', ctx.user_id)
    .select('id, kind')
    .maybeSingle()

  if (error) {
    if (isDuplicateName(error)) return { ok: false, error: `Ya tienes una carpeta llamada "${parsed.data}".` }
    return { ok: false, error: error.message }
  }
  if (!data) return { ok: false, error: 'Carpeta no encontrada.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revalidatePath(KIND_PATH[(data as any).kind as FolderKind])
  return { ok: true, data: null }
}

export async function renameFolder(folderId: string, name: string): Promise<ActionResult<null>> {
  return guarded('renameFolder', () => renameFolderImpl(folderId, name))
}

// ─── Borrar ───────────────────────────────────────────────────────────────────

async function deleteFolderImpl(folderId: string): Promise<ActionResult<null>> {
  const ctx = await requireTenantContext()
  const supabase = createAdminClient()

  // Borra la carpeta, nunca su contenido: las filas de folder_items caen por
  // cascada y las fuentes o secuencias vuelven a "Sin carpeta".
  const { data, error } = await supabase
    .from('folders')
    .delete()
    .eq('id', folderId)
    .eq('owner_user_id', ctx.user_id)
    .select('id, kind')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'Carpeta no encontrada.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revalidatePath(KIND_PATH[(data as any).kind as FolderKind])
  return { ok: true, data: null }
}

export async function deleteFolder(folderId: string): Promise<ActionResult<null>> {
  return guarded('deleteFolder', () => deleteFolderImpl(folderId))
}

// ─── Mover un elemento ────────────────────────────────────────────────────────

/** El elemento existe, es de este tenant y este usuario puede verlo. */
async function assertItemVisible(
  kind:   FolderKind,
  itemId: string,
  ctx:    Awaited<ReturnType<typeof requireTenantContext>>,
): Promise<{ error: string } | null> {
  const supabase = createAdminClient()
  const table = kind === 'source' ? 'acquisition_channels' : 'email_sequences'

  const { data } = await supabase
    .from(table)
    .select('id, tenant_id, agent_id')
    .eq('id', itemId)
    .maybeSingle()

  const notFound = kind === 'source' ? 'Fuente no encontrada.' : 'Secuencia no encontrada.'
  if (!data) return { error: notFound }
  // Mismo criterio de visibilidad que usa la lista: un agente sólo organiza lo
  // que ve, y el "no encontrada" no distingue entre inexistente y ajeno.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!isRowVisible(scopeFor(ctx), data as any)) return { error: notFound }
  return null
}

async function moveToFolderImpl(
  kind:     FolderKind,
  itemId:   string,
  folderId: string | null,
): Promise<ActionResult<null>> {
  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant para organizar en carpetas.' }

  const invisible = await assertItemVisible(kind, itemId, ctx)
  if (invisible) return { ok: false, error: invisible.error }

  const supabase = createAdminClient()
  const itemColumn = kind === 'source' ? 'channel_id' : 'sequence_id'

  // Un elemento está en una sola carpeta por usuario, así que mover es siempre
  // "quitar de donde esté y, si hay destino, poner ahí".
  const { error: clearError } = await supabase
    .from('folder_items')
    .delete()
    .eq('owner_user_id', ctx.user_id)
    .eq(itemColumn, itemId)

  if (clearError) return { ok: false, error: clearError.message }

  if (folderId) {
    // La carpeta destino tiene que ser de este usuario Y de esta sección: sin
    // comprobarlo, un id de otra sección metería una fuente en una carpeta de
    // emails, donde no se vería nunca más.
    const { data: folder } = await supabase
      .from('folders')
      .select(columns('folders', ['id', 'kind', 'tenant_id']))
      .eq('id', folderId)
      .eq('owner_user_id', ctx.user_id)
      .maybeSingle()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const f = folder as any
    if (!f || f.kind !== kind || f.tenant_id !== ctx.tenant_id) {
      return { ok: false, error: 'Carpeta no encontrada.' }
    }

    const { error } = await supabase.from('folder_items').insert({
      folder_id:     folderId,
      owner_user_id: ctx.user_id,
      [itemColumn]:  itemId,
    })
    if (error) return { ok: false, error: error.message }
  }

  revalidatePath(KIND_PATH[kind])
  return { ok: true, data: null }
}

export async function moveToFolder(
  kind:     FolderKind,
  itemId:   string,
  folderId: string | null,
): Promise<ActionResult<null>> {
  return guarded('moveToFolder', () => moveToFolderImpl(kind, itemId, folderId))
}
