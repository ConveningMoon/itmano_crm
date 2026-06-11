import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getAllActivity } from '@/lib/data/activity'
import { ActivityRow } from './activity-ui'

// Reads cookies via the tenant context → must render dynamically.
export const dynamic = 'force-dynamic'

const PAGE = 30

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ count?: string }>
}) {
  const { tenant_id, role, user_id } = await getCurrentTenantContext()
  const isSuper = role === 'super_admin'

  const { count: countParam } = await searchParams
  const count = Math.min(500, Math.max(PAGE, Number(countParam ?? PAGE) || PAGE))

  // Fetch one extra to know whether there is more to load.
  const items   = await getAllActivity(tenant_id, { role, userId: user_id }, { limit: count + 1, offset: 0 })
  const hasMore = items.length > count
  const visible = items.slice(0, count)

  return (
    <div style={{ maxWidth: '760px' }}>
      {/* Back nav */}
      <div style={{ marginBottom: '16px' }}>
        <Link
          href="/dashboard"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          <ArrowLeft size={14} />
          Dashboard
        </Link>
      </div>

      <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '16px' }}>
        Actividad
      </h1>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '8px 20px' }}>
        {visible.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No hay actividad todavía.
          </div>
        ) : (
          visible.map((item, idx) => (
            <div key={item.id}>
              <ActivityRow item={item} showTenant={isSuper} />
              {idx < visible.length - 1 && (
                <div style={{ height: '1px', background: 'var(--border-subtle)' }} />
              )}
            </div>
          ))
        )}
      </div>

      {hasMore && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <Link
            href={`/activity?count=${count + PAGE}`}
            style={{
              display: 'inline-block', fontSize: '13px', fontWeight: 500,
              color: 'var(--text-secondary)', textDecoration: 'none',
              border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 18px',
            }}
          >
            Cargar más
          </Link>
        </div>
      )}
    </div>
  )
}
