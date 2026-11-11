import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getProperties } from '@/lib/data/properties'
import { PropertiesClient } from './properties-client'
import { PropertiesListSkeleton } from './properties-skeleton'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'

// Lo que lee la sesión o la base vive aquí, detrás del Suspense de
// PropertiesPage: la cabecera sale del shell estático.
async function PropertiesContent() {
  const ctx = await requireTenantContext()
  const { tenant_id, role } = ctx
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
    />
  )
}

function PropertiesPage() {
  return (
    <>
      <PageHeader
        title="Propiedades"
        hint="El inventario de la agencia. Cada propiedad puede tener su página pública y sus open houses; ábrela para editarla, publicarla o programar uno."
      />
      <Suspense fallback={<PropertiesListSkeleton />}>
        <PropertiesContent />
      </Suspense>
    </>
  )
}

export default freshOnNavigation(PropertiesPage)
