import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getProperties } from '@/lib/data/properties'
import { PropertiesClient } from './properties-client'

export default async function PropertiesPage() {
  const ctx = await requireTenantContext()
  const { tenant_id, role, user_id } = ctx
  // Picker de tenant en el modal: solo super_admin SIN selección (hoy
  // inalcanzable aquí por requireTenantContext; actuando como tenant, la action
  // resuelve el tenant desde el contexto).
  const needsTenantPicker = role === 'super_admin' && !tenant_id

  const [properties, tenants] = await Promise.all([
    getProperties(tenant_id),
    needsTenantPicker
      ? createAdminClient()
          .from('tenants')
          .select('id, name')
          .order('name')
          .then(({ data }) =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (data ?? []).map((t: any) => ({ id: t.id as string, name: t.name as string }))
          )
      : Promise.resolve<Array<{ id: string; name: string }>>([] ),
  ])

  return (
    <PropertiesClient
      properties={properties}
      tenants={tenants}
      viewerRole={role}
      viewerUserId={user_id}
    />
  )
}
