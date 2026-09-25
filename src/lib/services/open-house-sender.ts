import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import { resolveSenderIdentity, usesSharedDomain, type SenderIdentity } from '@/lib/services/sender-identity'

// ¿Puede este tenant hacer open houses? Sólo si sus correos salen de SU
// dominio. Un anuncio masivo desde el dominio compartido de ITMANO pondría en
// riesgo la entrega de todos los tenants que lo comparten (ver
// usesSharedDomain). La regla se evalúa sobre la identidad resuelta, así que
// también cubre al tenant que se degrada después de programar: el
// despachador vuelve a preguntar antes de cada envío.

export const OWN_DOMAIN_REQUIRED_MESSAGE =
  'Los open houses envían correos masivos y sólo están disponibles cuando tu equipo envía desde su propio dominio verificado (planes Growth y Partner). Configúralo en Configuración → Email.'

export interface OpenHouseSender {
  identity:   SenderIdentity
  tenantName: string
  tenantSlug: string
}

export async function resolveOpenHouseSender(
  db: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true; sender: OpenHouseSender } | { ok: false; error: string }> {
  const [{ data: tenant }, access] = await Promise.all([
    db.from('tenants')
      .select('name, slug, email_from_address, resend_account, domain_status')
      .eq('id', tenantId)
      .maybeSingle(),
    getTenantAccessFor(tenantId),
  ])
  if (!tenant) return { ok: false, error: 'Equipo no encontrado.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = tenant as any
  const identity = resolveSenderIdentity(t, { customDomainAllowed: access.customDomainAllowed })
  if (!identity || usesSharedDomain(identity)) {
    return { ok: false, error: OWN_DOMAIN_REQUIRED_MESSAGE }
  }
  return {
    ok: true,
    sender: { identity, tenantName: t.name as string, tenantSlug: (t.slug as string | null) ?? '' },
  }
}
