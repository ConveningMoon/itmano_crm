import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createClient } from '@/lib/supabase/server'
import { getUnreadCount } from '@/lib/data/notifications'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx         = await getCurrentTenantContext()
  const unreadCount = await getUnreadCount(ctx.tenant_id)

  // The auth email isn't on the tenant context; read it from the session for the
  // sidebar footer (the session is already established — ctx redirected otherwise).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-base)' }}>
      <Sidebar role={ctx.role} userEmail={userEmail} />
      <div
        style={{
          flex: 1,
          marginLeft: '220px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <Topbar unreadCount={unreadCount} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
