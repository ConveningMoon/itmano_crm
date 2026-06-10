import { redirect } from 'next/navigation'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getTenantsWithOwners } from '@/lib/data/tenants'
import { AdminClient } from './admin-client'

// Super_admin-only onboarding console. Guarded server-side: a non-super context
// never sees this page (the nav item is also hidden for other roles).
export default async function AdminPage() {
  const ctx = await getCurrentTenantContext()
  if (ctx.role !== 'super_admin') redirect('/dashboard')

  const tenants = await getTenantsWithOwners()

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Administración
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Tenants · Provisión de propietarios
        </p>
      </div>

      <AdminClient tenants={tenants} />
    </>
  )
}
