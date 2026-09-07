import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'

// ─── Carpetas (migración 115) ─────────────────────────────────────────────────
//
// Son PERSONALES: la organización de cada usuario es suya y no se le impone al
// resto del equipo. Por eso toda lectura lleva SIEMPRE `owner_user_id`, además
// del `tenant_id` que exige el contrato del repo.
//
// Las carpetas son una capa de vista, no de permisos: agrupar una fuente no
// cambia quién puede verla. La visibilidad la siguen decidiendo `scopeFor` y
// RLS, así que la página filtra primero sus elementos y después los reparte en
// carpetas — una carpeta nunca puede hacer aparecer algo que el usuario no vería.

export type FolderKind = 'source' | 'sequence'

export interface Folder {
  id:       string
  name:     string
  position: number
  /** ids de los elementos que este usuario metió en la carpeta. */
  itemIds:  string[]
}

/** Carpetas del usuario para una sección, con su contenido, listas para agrupar. */
export async function listFolders(
  kind:     FolderKind,
  tenantId: string | null,
  userId:   string,
): Promise<Folder[]> {
  if (!tenantId) return []

  const supabase = createAdminClient()

  const { data: folderRows, error } = await supabase
    .from('folders')
    .select(columns('folders', ['id', 'name', 'position', 'created_at']))
    .eq('owner_user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .order('position')
    .order('created_at')

  if (error || !folderRows || folderRows.length === 0) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const folderIds = (folderRows as any[]).map(f => f.id as string)

  const itemColumn = kind === 'source' ? 'channel_id' : 'sequence_id'
  const { data: itemRows } = await supabase
    .from('folder_items')
    .select(`folder_id, ${itemColumn}`)
    .eq('owner_user_id', userId)
    .in('folder_id', folderIds)

  const itemsByFolder = new Map<string, string[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (itemRows ?? []) as any[]) {
    const itemId = row[itemColumn] as string | null
    if (!itemId) continue
    const list = itemsByFolder.get(row.folder_id as string)
    if (list) list.push(itemId)
    else itemsByFolder.set(row.folder_id as string, [itemId])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (folderRows as any[]).map(f => ({
    id:       f.id as string,
    name:     f.name as string,
    position: f.position as number,
    itemIds:  itemsByFolder.get(f.id as string) ?? [],
  }))
}

/**
 * Reparte una lista ya filtrada por visibilidad entre las carpetas del usuario.
 *
 * Trabaja sobre lo que la página YA decidió mostrar: si un elemento está en una
 * carpeta pero el usuario no debería verlo, simplemente no aparece — la carpeta
 * no lo saca de su escondite. Y un elemento sin carpeta cae en `loose`.
 */
export function groupByFolder<T extends { id: string }>(
  items:   T[],
  folders: Folder[],
): { folders: Array<Folder & { items: T[] }>; loose: T[] } {
  const byId    = new Map(items.map(i => [i.id, i]))
  const grouped = new Set<string>()

  const filled = folders.map(f => {
    const own: T[] = []
    for (const id of f.itemIds) {
      const item = byId.get(id)
      if (!item) continue
      own.push(item)
      grouped.add(id)
    }
    return { ...f, items: own }
  })

  return { folders: filled, loose: items.filter(i => !grouped.has(i.id)) }
}
