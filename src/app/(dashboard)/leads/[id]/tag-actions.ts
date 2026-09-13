'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { loadGuardedLead } from '@/lib/auth/lead-write-guard'

// Poner y quitar etiquetas a UN lead.
//
// No hay acción masiva a propósito. Desde la 117 una etiqueta puede disparar una
// secuencia de email, así que etiquetar 180 leads de una vez sería mandar 180
// correos reales en un clic. Etiquetar es una decisión por lead, igual que
// iniciar un proceso de compra.
//
// El permiso es el de escritura del lead (assertCanWriteLead vía
// loadGuardedLead): un agente etiqueta los leads que le pertenecen, el
// propietario los de su tenant. Etiquetar NO es administrar el catálogo — crear
// o borrar etiquetas vive en Configuración y es de owner/super_admin.

export type TagActionResult =
  | { ok: true }
  | { ok: false; error: string }

// Comprueba que la etiqueta exista y sea del MISMO tenant que el lead. Sin esto,
// un id de etiqueta de otro tenant pasaría la RLS del insert (el tenant_id lo
// pone el servidor desde el lead) y contaminaría el catálogo ajeno.
async function loadTagForTenant(
  supabase: ReturnType<typeof createAdminClient>,
  tagId: string,
  tenantId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from('lead_tags')
    .select('id, name')
    .eq('id', tagId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any
  return row ? { id: row.id as string, name: row.name as string } : null
}

export async function addTagToLead(leadId: string, tagId: string): Promise<TagActionResult> {
  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  const guard = await loadGuardedLead(supabase, ctx, leadId)
  if ('ok' in guard) return guard

  const tag = await loadTagForTenant(supabase, tagId, guard.tenant_id)
  if (!tag) return { ok: false, error: 'Etiqueta no encontrada' }

  // La PK (lead_id, tag_id) hace idempotente el doble clic: ignoreDuplicates
  // evita el error 23505 cuando la etiqueta ya estaba puesta.
  const { error } = await supabase
    .from('lead_tag_assignments')
    .upsert(
      {
        lead_id:     leadId,
        tag_id:      tagId,
        tenant_id:   guard.tenant_id,
        assigned_by: ctx.user_id,
      },
      { onConflict: 'lead_id,tag_id', ignoreDuplicates: true },
    )

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}

export async function removeTagFromLead(leadId: string, tagId: string): Promise<TagActionResult> {
  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  const guard = await loadGuardedLead(supabase, ctx, leadId)
  if ('ok' in guard) return guard

  const { error } = await supabase
    .from('lead_tag_assignments')
    .delete()
    .eq('lead_id', leadId)
    .eq('tag_id',  tagId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  return { ok: true }
}
