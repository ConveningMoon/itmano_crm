import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { listPlatformRequests } from './actions'
import { RequestsClient } from './requests-client'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'
import { ListCardSkeleton } from '@/components/ui/page-skeleton'

// Bandeja de solicitudes de plataforma — solo super_admin. Reúne el formulario
// de contacto de la landing (kind='contact') y el soporte del CRM
// (kind='support', incluye solicitudes de más capacidad de IA) en dos tabs,
// con checkbox de respondido por solicitud.
async function RequestsContent() {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') redirect('/dashboard')

  const requests = await listPlatformRequests()

  return <RequestsClient requests={requests} />
}

// La cabecera sale del shell estático; el guard de rol y la bandeja, detrás
// del Suspense (sin sesión no hay nada que redirigir antes de tiempo).
function SolicitudesPage() {
  return (
    <>
      <PageHeader
        title="Solicitudes"
        description="Contacto de la landing y soporte de los equipos."
        hint="Marca cada solicitud como respondida al gestionarla; la pestaña cuenta las que siguen pendientes."
      />

      <Suspense fallback={<ListCardSkeleton rows={8} />}>
        <RequestsContent />
      </Suspense>
    </>
  )
}

export default freshOnNavigation(SolicitudesPage)
