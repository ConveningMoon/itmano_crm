import { redirect } from 'next/navigation'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { listPlatformRequests } from './actions'
import { RequestsClient } from './requests-client'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'

// Bandeja de solicitudes de plataforma — solo super_admin. Reúne el formulario
// de contacto de la landing (kind='contact') y el soporte del CRM
// (kind='support', incluye solicitudes de más capacidad de IA) en dos tabs,
// con checkbox de respondido por solicitud.
async function SolicitudesPage() {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') redirect('/dashboard')

  const requests = await listPlatformRequests()

  return (
    <>
      <PageHeader title="Solicitudes" description="Contacto de la landing y soporte de los equipos — marca cada una como respondida al gestionarla." />

      <RequestsClient requests={requests} />
    </>
  )
}

export default freshOnNavigation(SolicitudesPage)
