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
  const folderColumns = columns('folders', ['id', 'name', 'position', 'created_at'])
  const itemColumns = columns('folder_items', ['channel_id', 'sequence_id'])

  const { data: folderRows, error } = await supabase
    .from('folders')
    // PostgREST resuelve la FK inversa en el mismo viaje. Antes se leían las
    // carpetas y luego sus elementos con otro request secuencial.
    .select(`${folderColumns}, folder_items(${itemColumns})`)
    .eq('owner_user_id', userId)
    .eq('tenant_id', tenantId)
    .eq('kind', kind)
    .eq('folder_items.owner_user_id', userId)
    .order('position')
    .order('created_at')

  if (error || !folderRows || folderRows.length === 0) return []

  const itemColumn = kind === 'source' ? 'channel_id' : 'sequence_id'
  type FolderRow = {
    id: string
    name: string
    position: number
    folder_items: Array<{ channel_id: string | null; sequence_id: string | null }> | null
  }

  // La selección se compone con `columns()` para validar cada nombre; el
  // parser genérico de supabase-js pierde el literal al interpolarlos y la
  // representa como ParserError aunque PostgREST devuelva esta forma.
  return (folderRows as unknown as FolderRow[]).map(folder => ({
    id:       folder.id,
    name:     folder.name,
    position: folder.position,
    itemIds:  (folder.folder_items ?? [])
      .map(item => item[itemColumn])
      .filter((id): id is string => typeof id === 'string'),
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
