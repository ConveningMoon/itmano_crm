import { Sidebar } from '@/components/layout/sidebar'
import { Topbar } from '@/components/layout/topbar'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { createClient } from '@/lib/supabase/server'
import { getUnreadCount } from '@/lib/data/notifications'
import { getTenantsForSwitcher, getTenantBranding } from '@/lib/data/tenants'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx         = await getCurrentTenantContext()
  const unreadCount = await getUnreadCount(
    ctx.tenant_id,
    ctx.role === 'agent' ? ctx.agent_id : null,
  )
  // Modo hub: super_admin sin tenant seleccionado — el nav colapsa a
  // Centro de control + Notificaciones (el resto redirigiría al hub).
  const hubMode = ctx.role === 'super_admin' && !ctx.tenant_id
  // Switcher del topbar: solo el super_admin carga la lista de tenants.
  const switcherTenants = ctx.role === 'super_admin' ? await getTenantsForSwitcher() : null

  // Branding del tenant activo (logo del sidebar). En modo hub no hay tenant —
  // el shell muestra el wordmark de ITMANO.
  const branding = ctx.tenant_id ? await getTenantBranding(ctx.tenant_id) : null

  // The auth email isn't on the tenant context; read it from the session for the
  // sidebar footer (the session is already established — ctx redirected otherwise).
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const userEmail = user?.email ?? ''

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-base)' }}>
      <Sidebar
        role={ctx.role}
        userEmail={userEmail}
        hubMode={hubMode}
        logoUrl={branding?.logoUrl ?? null}
        tenantName={branding?.name ?? null}
      />
      {/* Sidebar offset + content gutter come from the authoritative .app-shell-*
          rules in globals.css (a layered utility would lose to the unlayered
          `* { margin:0; padding:0 }` reset). ≥768px = 220px offset + 24px gutter
          (byte-identical to pre-responsive); <768px = no offset + 16px gutter. */}
      <div
        className="app-shell-content max-md:min-w-0"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
        }}
      >
        <Topbar
          role={ctx.role}
          unreadCount={unreadCount}
          userEmail={userEmail}
          hubMode={hubMode}
          tenants={switcherTenants ?? undefined}
          activeTenantId={ctx.acting_as_tenant ? ctx.tenant_id : null}
          logoUrl={branding?.logoUrl ?? null}
          tenantName={branding?.name ?? null}
        />
        <main className="app-shell-main max-md:overflow-x-hidden" style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
