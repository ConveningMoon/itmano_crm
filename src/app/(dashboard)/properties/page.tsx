import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getProperties } from '@/lib/data/properties'
import { PropertiesClient } from './properties-client'

export default async function PropertiesPage() {
  const ctx = await getCurrentTenantContext()
  const { tenant_id, role, user_id } = ctx
  const isSuperAdmin = role === 'super_admin'

  const [properties, tenants] = await Promise.all([
    getProperties(tenant_id),
    isSuperAdmin
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
