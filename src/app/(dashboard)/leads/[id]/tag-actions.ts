'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { loadGuardedLead } from '@/lib/auth/lead-write-guard'
import { cancelTagSequenceRuns, enrollLeadByTag, type TagEnrollResult } from '@/lib/services/enroll-lead-by-tag'
import { LANGUAGE_CONFIG } from '@/lib/config'
import type { Language } from '@/lib/types'

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
  // `notice` es lo que pasó con el correo automático de la etiqueta, para
  // decírselo a quien etiquetó en el momento. Silencio cuando la etiqueta no
  // manda correos (la mayoría) — ahí no hay nada que avisar.
  | { ok: true; notice?: { kind: 'ok' | 'warn'; message: string } }
  | { ok: false; error: string }

// Comprueba que la etiqueta exista y sea del MISMO tenant que el lead. Sin esto,
// un id de etiqueta de otro tenant pasaría la RLS del insert (el tenant_id lo
// pone el servidor desde el lead) y contaminaría el catálogo ajeno.
async function loadTagForTenant(
  supabase: ReturnType<typeof createAdminClient>,
  tagId: string,
  tenantId: string,
): Promise<{ id: string; name: string; requiresSequence: boolean } | null> {
  const { data } = await supabase
    .from('lead_tags')
    .select('id, name, requires_sequence')
    .eq('id', tagId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = data as any
  return row
    ? { id: row.id as string, name: row.name as string, requiresSequence: !!row.requires_sequence }
    : null
}

function languageLabel(code: string): string {
  return LANGUAGE_CONFIG[code as Language]?.label ?? code.toUpperCase()
}

// Traduce el resultado del disparo a lo que se le muestra a quien etiquetó.
// Sólo habla cuando hay algo que decir: que el correo salió, o por qué no salió
// habiendo debido salir. Una etiqueta que no manda correos no genera aviso.
function noticeFor(
  result: TagEnrollResult,
  tag: { name: string; requiresSequence: boolean },
): { kind: 'ok' | 'warn'; message: string } | undefined {
  if (result.enrolled) {
    return { kind: 'ok', message: `Secuencia iniciada: ${result.sequenceName}.` }
  }

  switch (result.reason) {
    case 'no_sequence':
      // Silencio salvo que la etiqueta esté marcada como "debe mandar correos":
      // ahí el hueco es un problema de configuración que alguien tiene que ver.
      return tag.requiresSequence
        ? { kind: 'warn', message: `"${tag.name}" no tiene secuencia configurada todavía. No se envió ningún correo.` }
        : undefined
    case 'no_sequence_for_language':
      return {
        kind: 'warn',
        message: `Falta la versión en ${languageLabel(result.language ?? '')} de la secuencia de "${tag.name}". No se envió ningún correo.`,
      }
    case 'no_steps':
      return { kind: 'warn', message: `La secuencia de "${tag.name}" no tiene pasos activos. No se envió ningún correo.` }
    case 'email_blocked':
      return { kind: 'warn', message: 'Este lead tiene el correo bloqueado (baja o rebote). No se envió ningún correo.' }
    case 'out_of_funnel':
      return { kind: 'warn', message: 'El lead ya salió del embudo activo, así que no se inició ninguna secuencia.' }
    case 'already_active':
      return { kind: 'ok', message: 'La secuencia de esta etiqueta ya estaba en curso.' }
    default:
      return { kind: 'warn', message: 'La etiqueta se guardó, pero la secuencia no pudo iniciarse.' }
  }
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

  // La etiqueta ya está puesta. El disparo de la secuencia va DESPUÉS y su fallo
  // no la deshace: etiquetar también sirve para filtrar y supervisar, así que
  // perder la etiqueta porque el correo no salió sería el peor resultado.
  const enrollment = await enrollLeadByTag({
    db: supabase, lead_id: leadId, tag_id: tagId, tenant_id: guard.tenant_id,
  })

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/emails')
  return { ok: true, notice: noticeFor(enrollment, tag) }
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

  // Quitar la etiqueta corta la secuencia que había disparado. Sin esto el lead
  // seguiría recibiendo los pasos siguientes de una etiqueta que ya no tiene.
  const cancelled = await cancelTagSequenceRuns({
    db: supabase, lead_id: leadId, tag_id: tagId, tenant_id: guard.tenant_id,
  })

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/emails')
  return {
    ok: true,
    notice: cancelled > 0
      ? { kind: 'ok', message: cancelled === 1
          ? 'Se canceló la secuencia que había disparado esta etiqueta.'
          : `Se cancelaron ${cancelled} secuencias que había disparado esta etiqueta.` }
      : undefined,
  }
}
