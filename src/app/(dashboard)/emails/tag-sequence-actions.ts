'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { requireWriteAccess } from '@/lib/auth/guards'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import type { Language } from '@/lib/types'

// Alta de la secuencia de una etiqueta en un idioma (117).
//
// No reusa createSequence porque los datos que allí se piden aquí no se eligen:
// el nombre sale de la etiqueta y del idioma, el tipo de activación es 'tag' y
// la etiqueta es el disparador. Lo único que decide quien la crea es en qué
// idioma. Después se le escriben los pasos en /emails/[id], como a cualquier
// otra secuencia.

export async function createTagSequence(
  tagId: string,
  language: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const ctx    = await getCurrentTenantContext()
  const denied = requireWriteAccess(ctx)
  if (denied) return denied

  if (!(SUPPORTED_LANGUAGE_CODES as readonly string[]).includes(language)) {
    return { ok: false, error: 'Idioma no soportado.' }
  }

  const supabase = createAdminClient()

  // La etiqueta fija el tenant: así un id de otra agencia no puede colar una
  // secuencia en este catálogo, y el super_admin no necesita elegir tenant.
  const { data: tagRow } = await supabase
    .from('lead_tags')
    .select('id, name, tenant_id')
    .eq('id', tagId)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tag = tagRow as any
  if (!tag) return { ok: false, error: 'Etiqueta no encontrada' }
  if (ctx.tenant_id && tag.tenant_id !== ctx.tenant_id) {
    return { ok: false, error: 'Etiqueta no encontrada' }
  }

  const tenantId = tag.tenant_id as string

  // Mismo gate que createSequence: crear secuencias nuevas necesita suscripción
  // activa. Las que ya existen siguen enviando.
  const access = await getTenantAccessFor(tenantId)
  if (!access.canCreateSequences) {
    return { ok: false, error: 'Crear secuencias requiere una suscripción activa. Tus secuencias existentes se conservan intactas.' }
  }

  const langLabel = LANGUAGE_CONFIG[language as Language]?.label ?? language.toUpperCase()

  const { data, error } = await supabase
    .from('email_sequences')
    .insert({
      tenant_id:       tenantId,
      name:            `${tag.name} · ${langLabel}`,
      language,
      description:     `Correo automático de la etiqueta "${tag.name}". Se envía al ponerle la etiqueta a un lead que habla ${langLabel}.`,
      activation_type: 'tag',
      trigger_tag_id:  tagId,
      // Toda la agencia: el remitente y la firma los resuelve el agente del
      // lead al enviar, no el dueño organizativo de la secuencia.
      agent_id:        null,
      active:          true,
    })
    .select('id')
    .single()

  if (error || !data) {
    // 23505 = el índice único (tenant, etiqueta, idioma): ya existe.
    if (error?.code === '23505') {
      return { ok: false, error: `Ya existe la secuencia de "${tag.name}" en ${langLabel}.` }
    }
    return { ok: false, error: error?.message ?? 'Error al crear la secuencia' }
  }

  revalidatePath('/emails')
  revalidatePath('/leads')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { ok: true, id: (data as any).id as string }
}
