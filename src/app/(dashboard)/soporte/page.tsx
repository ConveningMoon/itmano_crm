import { createClient } from '@/lib/supabase/server'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { SupportForm } from './support-form'

// Soporte técnico dentro del CRM: cualquier usuario del tenant puede escribir a
// ITMANO. El formulario se envía a support@itmano.com (server action) con la
// identidad del solicitante adjuntada automáticamente.
export default async function SoportePage() {
  await getCurrentTenantContext() // guard (redirige a /login sin sesión)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Soporte técnico
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          ¿Algo no funciona o tienes una duda? Escríbenos y te ayudamos.
        </p>
      </div>

      <SupportForm userEmail={userEmail} />

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '16px', maxWidth: '620px', lineHeight: 1.55 }}>
        ¿Prefieres el correo? Escríbenos directamente a{' '}
        <a href="mailto:support@itmano.com" style={{ color: 'var(--accent-gold)' }}>support@itmano.com</a>.
      </p>
    </>
  )
}
