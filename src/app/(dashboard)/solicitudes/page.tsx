import { redirect } from 'next/navigation'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { listPlatformRequests } from './actions'
import { RequestsClient } from './requests-client'

// Bandeja de solicitudes de plataforma — solo super_admin. Reúne el formulario
// de contacto de la landing (kind='contact') y el soporte del CRM
// (kind='support', incluye solicitudes de más capacidad de IA) en dos tabs,
// con checkbox de respondido por solicitud.
export default async function SolicitudesPage() {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') redirect('/dashboard')

  const requests = await listPlatformRequests()

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Solicitudes
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Contacto de la landing y soporte de los equipos — marca cada una como respondida al gestionarla.
        </p>
      </div>

      <RequestsClient requests={requests} />
    </>
  )
}
