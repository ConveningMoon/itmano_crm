import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import type { LeadTag } from '@/lib/leads/tags'

// Lecturas del catálogo de etiquetas y de las asignaciones. Las escrituras van
// por Server Actions (src/app/(dashboard)/leads/[id]/tag-actions.ts y
// src/app/(dashboard)/settings/tag-actions.ts), como el resto del repo.

const TAG_COLUMNS = columns('lead_tags', [
  'id', 'name', 'slug', 'color', 'description', 'position',
])

// reason: el cliente de Supabase no está tipado con el esquema generado
/* eslint-disable @typescript-eslint/no-explicit-any */

function mapTag(r: any): LeadTag {
  return {
    id:          r.id as string,
    name:        r.name as string,
    slug:        r.slug as string,
    color:       r.color as string,
    description: (r.description ?? null) as string | null,
    position:    (r.position ?? 0) as number,
  }
}

// Catálogo del tenant, en el orden en que se muestra en todas partes.
// tenantId null (super_admin sin tenant seleccionado) → vacío: una etiqueta
// siempre pertenece a un tenant y mezclar los catálogos de varios no describe
// nada.
export async function listLeadTags(tenantId: string | null): Promise<LeadTag[]> {
  if (!tenantId) return []

  const { data } = await createAdminClient()
    .from('lead_tags')
    .select(TAG_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('position')
    .order('created_at')

  return ((data ?? []) as any[]).map(mapTag)
}

// Etiquetas de UN lead, ya resueltas a su fila del catálogo y en el orden del
// catálogo (no el de asignación: la ficha debe verse igual siempre).
export async function getTagsForLead(leadId: string): Promise<LeadTag[]> {
  const { data } = await createAdminClient()
    .from('lead_tag_assignments')
    .select(`tag_id, lead_tags (${TAG_COLUMNS})`)
    .eq('lead_id', leadId)

  const tags = ((data ?? []) as any[])
    .map(r => (Array.isArray(r.lead_tags) ? r.lead_tags[0] : r.lead_tags))
    .filter(Boolean)
    .map(mapTag)

  return tags.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name))
}

// Cuántos leads tiene cada etiqueta, para el catálogo de Configuración: borrar
// una etiqueta que 40 leads están usando no debe parecer gratis.
export async function countLeadsByTag(tenantId: string | null): Promise<Record<string, number>> {
  if (!tenantId) return {}

  const { data } = await createAdminClient()
    .from('lead_tag_assignments')
    .select('tag_id')
    .eq('tenant_id', tenantId)

  const counts: Record<string, number> = {}
  for (const r of (data ?? []) as any[]) {
    const id = r.tag_id as string
    counts[id] = (counts[id] ?? 0) + 1
  }
  return counts
}
