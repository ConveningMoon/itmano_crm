import { Suspense } from 'react'
import Link from 'next/link'
import { LinkPendingSpinner } from '@/components/ui/loading-indicator'
import { ArrowLeft, History } from 'lucide-react'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { getAllActivity } from '@/lib/data/activity'
import { ActivityRow } from './activity-ui'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'
import { ListCardSkeleton } from '@/components/ui/page-skeleton'

const PAGE = 30

type SearchParams = Promise<{ count?: string }>

// Lo que lee la sesión, la base o la URL vive aquí, detrás del Suspense de
// ActivityPage: la cabecera sale del shell estático.
async function ActivityContent({ searchParams }: { searchParams: SearchParams }) {
  const { tenant_id, role, user_id } = await requireTenantContext()
  const isSuper = role === 'super_admin'

  const { count: countParam } = await searchParams
  const count = Math.min(500, Math.max(PAGE, Number(countParam ?? PAGE) || PAGE))

  // Fetch one extra to know whether there is more to load.
  const items   = await getAllActivity(tenant_id, { role, userId: user_id }, { limit: count + 1, offset: 0 })
  const hasMore = items.length > count
  const visible = items.slice(0, count)

  return (
    <>
      {visible.length === 0 ? (
        <div className="empty-card feed-narrow">
          <span className="empty-card-icon" aria-hidden="true"><History size={18} /></span>
          No hay actividad todavía.
        </div>
      ) : (
        <div className="feed feed-narrow">
          {visible.map(item => <ActivityRow key={item.id} item={item} showTenant={isSuper} />)}
        </div>
      )}

      {hasMore && (
        <div className="feed-more feed-narrow">
          <Link href={`/activity?count=${count + PAGE}`} className="btn btn-ghost" scroll={false}>
            Cargar más
            <LinkPendingSpinner />
          </Link>
        </div>
      )}
    </>
  )
}

function ActivityPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader
        title="Actividad"
        actions={
          <Link href="/dashboard" className="btn btn-ghost">
            <ArrowLeft size={14} aria-hidden="true" />
            Dashboard
          </Link>
        }
      />
      <Suspense fallback={<ListCardSkeleton rows={12} />}>
        <ActivityContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

export default freshOnNavigation(ActivityPage)
