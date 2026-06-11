import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUnreadCount } from '@/lib/data/notifications'

function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local.slice(0, 2).toUpperCase() || '??'
}

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

  // Avatar initials: if this login is linked to an agent record, use that agent's
  // avatar_initials; otherwise derive from the email (owner / super_admin).
  let avatarInitials = initialsFromEmail(userEmail)
  if (user?.id) {
    const { data: agentRow } = await createAdminClient()
      .from('agents')
      .select('avatar_initials')
      .eq('user_id', user.id)
      .maybeSingle()
    const initials = (agentRow as { avatar_initials?: string } | null)?.avatar_initials
    if (initials) avatarInitials = initials
  }

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
        <Topbar unreadCount={unreadCount} userEmail={userEmail} avatarInitials={avatarInitials} />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
