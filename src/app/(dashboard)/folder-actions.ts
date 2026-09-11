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

type TenantContext = Awaited<ReturnType<typeof requireTenantContext>>
type AdminClient = ReturnType<typeof createAdminClient>

async function nextFolderPosition(
  supabase: AdminClient,
  ctx: TenantContext,
  kind: FolderKind,
): Promise<number> {
  const { data: last } = await supabase
    .from('folders')
    .select(columns('folders', ['position']))
    .eq('owner_user_id', ctx.user_id)
    .eq('tenant_id', ctx.tenant_id)
    .eq('kind', kind)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((last as any)?.position ?? -1) + 1
}

async function insertFolder(
  supabase: AdminClient,
  ctx: TenantContext,
  kind: FolderKind,
  name: string,
  position: number,
): Promise<ActionResult<{ id: string }>> {
  const { data, error } = await supabase
    .from('folders')
    .insert({
      tenant_id:     ctx.tenant_id!,
      owner_user_id: ctx.user_id,
      kind,
      name,
      position,
    })
    .select(columns('folders', ['id']))
    .single()

  if (error) {
    if (isDuplicateName(error)) return { ok: false, error: `Ya tienes una carpeta llamada "${name}".` }
    return { ok: false, error: error.message }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, data: { id: (data as any).id as string } }
}

// ─── Crear ────────────────────────────────────────────────────────────────────

async function createFolderImpl(kind: FolderKind, rawName: string): Promise<ActionResult<{ id: string }>> {
  const parsed = NameSchema.safeParse(rawName)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant para organizar en carpetas.' }

  const supabase = createAdminClient()
  const position = await nextFolderPosition(supabase, ctx, kind)
  const created = await insertFolder(supabase, ctx, kind, parsed.data, position)
  if (!created.ok) return created

  revalidatePath(KIND_PATH[kind])
  return created
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
    .select(columns('folders', ['id', 'kind']))
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
    .select(columns('folders', ['id', 'kind']))
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
  supabase: AdminClient,
  kind:   FolderKind,
  itemId: string,
  ctx:    TenantContext,
): Promise<{ error: string } | null> {
  const table = kind === 'source' ? 'acquisition_channels' : 'email_sequences'
  const itemColumns = kind === 'source'
    ? columns('acquisition_channels', ['id', 'tenant_id', 'agent_id'])
    : columns('email_sequences', ['id', 'tenant_id', 'agent_id'])

  const { data } = await supabase
    .from(table)
    .select(itemColumns)
    .eq('id', itemId)
    .eq('tenant_id', ctx.tenant_id)
    .maybeSingle()

  const notFound = kind === 'source' ? 'Fuente no encontrada.' : 'Secuencia no encontrada.'
  if (!data) return { error: notFound }
  // Mismo criterio de visibilidad que usa la lista: un agente sólo organiza lo
  // que ve, y el "no encontrada" no distingue entre inexistente y ajeno.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!isRowVisible(scopeFor(ctx), data as any)) return { error: notFound }
  return null
}

/** La carpeta destino pertenece al usuario, tenant y sección actuales. */
async function assertFolderVisible(
  supabase: AdminClient,
  kind: FolderKind,
  folderId: string,
  ctx: TenantContext,
): Promise<{ error: string } | null> {
  const { data, error } = await supabase
    .from('folders')
    .select(columns('folders', ['id']))
    .eq('id', folderId)
    .eq('owner_user_id', ctx.user_id)
    .eq('tenant_id', ctx.tenant_id)
    .eq('kind', kind)
    .maybeSingle()

  if (error) return { error: error.message }
  return data ? null : { error: 'Carpeta no encontrada.' }
}

/**
 * Cambia la pertenencia con un UPDATE primero: mover entre carpetas cuesta una
 * sola escritura y conserva la carpeta anterior si la nueva operación falla.
 * Sólo hace INSERT cuando el elemento todavía estaba en "Sin carpeta".
 */
async function setFolderMembership(
  supabase: AdminClient,
  kind: FolderKind,
  itemId: string,
  folderId: string | null,
  ctx: TenantContext,
): Promise<{ error: string } | null> {
  const itemColumn = kind === 'source' ? 'channel_id' : 'sequence_id'

  if (!folderId) {
    const { error } = await supabase
      .from('folder_items')
      .delete()
      .eq('owner_user_id', ctx.user_id)
      .eq(itemColumn, itemId)
    return error ? { error: error.message } : null
  }

  const { data: updated, error: updateError } = await supabase
    .from('folder_items')
    .update({ folder_id: folderId })
    .eq('owner_user_id', ctx.user_id)
    .eq(itemColumn, itemId)
    .select(columns('folder_items', ['id']))
    .maybeSingle()

  if (updateError) return { error: updateError.message }
  if (updated) return null

  const { error: insertError } = await supabase.from('folder_items').insert({
    folder_id:     folderId,
    owner_user_id: ctx.user_id,
    [itemColumn]:  itemId,
  })
  return insertError ? { error: insertError.message } : null
}

async function moveToFolderImpl(
  kind:     FolderKind,
  itemId:   string,
  folderId: string | null,
): Promise<ActionResult<null>> {
  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant para organizar en carpetas.' }

  const supabase = createAdminClient()
  // Las dos lecturas no dependen entre sí. Hacerlas juntas ahorra una latencia
  // completa de red antes de la escritura.
  const [invisible, hiddenFolder] = await Promise.all([
    assertItemVisible(supabase, kind, itemId, ctx),
    folderId ? assertFolderVisible(supabase, kind, folderId, ctx) : Promise.resolve(null),
  ])
  if (invisible) return { ok: false, error: invisible.error }
  if (hiddenFolder) return { ok: false, error: hiddenFolder.error }

  const membershipError = await setFolderMembership(supabase, kind, itemId, folderId, ctx)
  if (membershipError) return { ok: false, error: membershipError.error }

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

// ─── Crear y mover en un solo viaje ──────────────────────────────────────────

async function createFolderAndMoveImpl(
  kind: FolderKind,
  itemId: string,
  rawName: string,
): Promise<ActionResult<{ id: string }>> {
  const parsed = NameSchema.safeParse(rawName)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) return { ok: false, error: 'Selecciona un tenant para organizar en carpetas.' }

  const supabase = createAdminClient()
  const [invisible, position] = await Promise.all([
    assertItemVisible(supabase, kind, itemId, ctx),
    nextFolderPosition(supabase, ctx, kind),
  ])
  if (invisible) return { ok: false, error: invisible.error }

  const created = await insertFolder(supabase, ctx, kind, parsed.data, position)
  if (!created.ok) return created

  const membershipError = await setFolderMembership(supabase, kind, itemId, created.data.id, ctx)
  if (membershipError) {
    // El gesto es una sola intención. Si no se pudo mover, no dejamos una
    // carpeta vacía que el usuario nunca pidió por separado.
    await supabase.from('folders').delete().eq('id', created.data.id).eq('owner_user_id', ctx.user_id)
    return { ok: false, error: membershipError.error }
  }

  revalidatePath(KIND_PATH[kind])
  return created
}

export async function createFolderAndMove(
  kind: FolderKind,
  itemId: string,
  name: string,
): Promise<ActionResult<{ id: string }>> {
  return guarded('createFolderAndMove', () => createFolderAndMoveImpl(kind, itemId, name))
}
