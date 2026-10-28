import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { SupportForm } from './support-form'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'

// Soporte técnico dentro del CRM: cualquier usuario del tenant puede escribir a
// ITMANO. La solicitud se registra en el CRM (platform_requests → /solicitudes
// del super_admin, con aviso por Telegram) con la identidad del solicitante
// adjuntada automáticamente.
async function SoportePage() {
  // Guard (redirige a /login sin sesión) y, de paso, el email del solicitante:
  // sale del claim ya validado, sin pedírselo otra vez al servidor de auth.
  const { email: userEmail } = await getCurrentTenantContext()

  return (
    <>
      <PageHeader title="Soporte técnico" description="¿Algo no funciona o tienes una duda? Escríbenos y te ayudamos." />

      <SupportForm userEmail={userEmail} />

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '16px', maxWidth: '620px', lineHeight: 1.55 }}>
        ¿Prefieres el correo? Escríbenos directamente a{' '}
        <a href="mailto:support@itmano.com" style={{ color: 'var(--accent-gold)' }}>support@itmano.com</a>.
      </p>
    </>
  )
}

export default freshOnNavigation(SoportePage)
