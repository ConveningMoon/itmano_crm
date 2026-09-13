import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import type { TenantContext } from '@/lib/auth/tenant-context'
import { assertCanWriteLead } from '@/lib/auth/guards'

/**
 * Carga un lead acotado al tenant de quien llama (super_admin: `ctx.tenant_id`
 * null → sin filtro) y lo pasa por `assertCanWriteLead`.
 *
 * Vive aquí y no dentro de un archivo `'use server'` porque lo comparten las
 * acciones de la ficha del lead y las de etiquetas: exportarlo desde un módulo
 * de acciones lo convertiría en un endpoint, y duplicarlo significaría mantener
 * la misma comprobación de permisos en dos sitios.
 *
 * @returns el tenant_id del lead (para los inserts que vienen después), o la
 *          negación lista para devolver desde la acción.
 */
export async function loadGuardedLead(
  supabase: ReturnType<typeof createAdminClient>,
  ctx: TenantContext,
  leadId: string,
): Promise<{ tenant_id: string } | { ok: false; error: string }> {
  let leadQ = supabase.from('leads').select('tenant_id, agent_id').eq('id', leadId)
  if (ctx.tenant_id) leadQ = leadQ.eq('tenant_id', ctx.tenant_id)
  const { data: lead } = await leadQ.maybeSingle()
  if (!lead) return { ok: false, error: 'Lead no encontrado o sin acceso' }

  const row    = lead as { tenant_id: string; agent_id: string }
  const denied = assertCanWriteLead(ctx, row)
  if (denied) return denied
  return { tenant_id: row.tenant_id }
}
