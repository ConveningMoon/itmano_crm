import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getUnreadCount } from '@/lib/data/notifications'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx         = await getCurrentTenantContext()
  const unreadCount = await getUnreadCount(ctx.tenant_id)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-base)' }}>
      <Sidebar />
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
