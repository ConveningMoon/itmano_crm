import 'server-only'
import { cookies } from 'next/headers'
import { createAdminClient } from '@/lib/supabase/admin'

// Cookie de "tenant seleccionado" del super_admin. Solo se honra cuando el
// perfil del request es super_admin (revalidado en tenant-context) — para
// cualquier otro rol se ignora siempre.
export const ADMIN_TENANT_COOKIE = 'itmano-admin-tenant'

export interface SelectedTenant {
  id: string
  name: string
  primaryColor: string
}

// Lee la cookie y la valida contra la tabla tenants. Devuelve null si no hay
// cookie o el tenant ya no existe (cookie huérfana/manipulada → se ignora; no
// se puede borrar una cookie durante el render RSC, se limpia en la próxima
// action enterTenant/exitToHub).
export async function getSelectedTenant(): Promise<SelectedTenant | null> {
  const store = await cookies()
  const tenantId = store.get(ADMIN_TENANT_COOKIE)?.value
  if (!tenantId) return null

  const supabase = createAdminClient()
  const { data } = await supabase
    .from('tenants')
    .select('id, name, primary_color')
    .eq('id', tenantId)
    .maybeSingle()
  if (!data) return null

  return {
    id: data.id as string,
    name: data.name as string,
    primaryColor: (data.primary_color as string) ?? '#1E3A5F',
  }
}
