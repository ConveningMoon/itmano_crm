import { Suspense } from 'react'
import Link from 'next/link'
import { LinkPendingSpinner } from '@/components/ui/loading-indicator'
import {
  Flame, Mail, Trash2, CalendarPlus, FileText,
  TrendingUp, UserPlus, Bell, type LucideIcon,
} from 'lucide-react'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getNotifications } from '@/lib/data/notifications'
import { MarkReadOnMount } from './mark-read-on-mount'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'
import { ListCardSkeleton } from '@/components/ui/page-skeleton'

// ─── Presentación por tipo ───────────────────────────────────────────────────
// Rampa dorada para todo; coral sólo para el lead caliente, que es una alerta y
// siempre va con icono y etiqueta. Los tipos de archivo/borrado van atenuados.
interface TypeMeta { label: string; icon: LucideIcon; color: string }

const TYPE_CONFIG: Record<string, TypeMeta> = {
  hot_lead:              { label: 'Lead caliente',     icon: Flame,        color: 'var(--alert)' },
  contact_us:            { label: 'Contact Us',        icon: Mail,         color: 'var(--gold-1)' },
  contact_form_question: { label: 'Contacto',          icon: Mail,         color: 'var(--gold-1)' },
  lead_deleted:          { label: 'Lead eliminado',    icon: Trash2,       color: 'var(--text-muted)' },
  event_added:           { label: 'Evento',            icon: CalendarPlus, color: 'var(--gold-2)' },
  event_deleted:         { label: 'Evento archivado',  icon: Trash2,       color: 'var(--text-muted)' },
  lm_added:              { label: 'Lead magnet',       icon: FileText,     color: 'var(--gold-3)' },
  lm_deleted:            { label: 'Lead magnet archivado', icon: Trash2,   color: 'var(--text-muted)' },
  // Tipos históricos (ya no se emiten; se conservan para que las filas viejas se vean)
  score_threshold:       { label: 'Umbral de score',   icon: TrendingUp,   color: 'var(--gold-2)' },
  lead_created:          { label: 'Nuevo lead',        icon: UserPlus,     color: 'var(--gold-2)' },
}

function metaFor(type: string): TypeMeta {
  return TYPE_CONFIG[type] ?? { label: type, icon: Bell, color: 'var(--text-secondary)' }
}

// Filtros: el conjunto que se emite hoy (los históricos siguen saliendo en "Todas").
const FILTER_TYPES = [
  'hot_lead', 'contact_us', 'contact_form_question',
  'lead_deleted', 'event_added', 'event_deleted', 'lm_added', 'lm_deleted',
] as const

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (secs < 60)      return 'hace un momento'
  const mins = Math.floor(secs / 60)
  if (mins < 60)      return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24)     return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7)       return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

type SearchParams = Promise<{ type?: string }>

// Sesión, base y filtro de la URL detrás del Suspense de NotificationsPage: la
// cabecera sale del shell estático.
async function NotificationsContent({ searchParams }: { searchParams: SearchParams }) {
  const ctx        = await getCurrentTenantContext()
  const { type }   = await searchParams
  const typeFilter = type ?? null
  const isSuper    = ctx.role === 'super_admin'

  const notifications = await getNotifications(ctx.tenant_id, {
    type:    typeFilter,
    agentId: ctx.role === 'agent' ? ctx.agent_id : null,
  })
  const hasUnread     = notifications.some(n => !n.read)

  return (
    <>
      <MarkReadOnMount hasUnread={hasUnread} />

      <nav className="toolbar" aria-label="Filtrar notificaciones">
        <div className="filter-tabs">
          <FilterTab label="Todas" href="/notifications" active={typeFilter === null} />
          {FILTER_TYPES.map(t => (
            <FilterTab key={t} label={metaFor(t).label} href={`/notifications?type=${t}`} active={typeFilter === t} />
          ))}
        </div>
      </nav>

      {notifications.length === 0 ? (
        <div className="empty-card feed-narrow">
          <span className="empty-card-icon" aria-hidden="true"><Bell size={18} /></span>
          {typeFilter ? 'No hay notificaciones de este tipo.' : 'No hay notificaciones todavía.'}
        </div>
      ) : (
        <div className="feed feed-narrow">
          {notifications.map(n => {
            const meta = metaFor(n.type)
            const Icon = meta.icon
            const body = (
              <>
                <span className="feed-icon" style={{ '--tone': meta.color } as React.CSSProperties} aria-hidden="true">
                  <Icon size={15} strokeWidth={2} />
                </span>
                <div className="feed-body">
                  <div className="feed-head">
                    <span className="feed-title">{meta.label}</span>
                    {isSuper && n.tenantName && <span className="feed-tag">{n.tenantName}</span>}
                  </div>
                  <p className="feed-text">{n.message}</p>
                  <div className="feed-meta">{relativeTime(n.createdAt)}</div>
                </div>
                {!n.read && <span className="feed-unread" role="img" aria-label="No leída" />}
              </>
            )

            // Si la notificación trae un lead, la fila entera lleva a él.
            return n.leadId ? (
              <Link key={n.id} href={`/leads/${n.leadId}`} className="feed-row">{body}</Link>
            ) : (
              <div key={n.id} className="feed-row">{body}</div>
            )
          })}
        </div>
      )}
    </>
  )
}

function NotificationsPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <>
      <PageHeader title="Notificaciones" />
      <Suspense fallback={<ListCardSkeleton rows={10} />}>
        <NotificationsContent searchParams={searchParams} />
      </Suspense>
    </>
  )
}

// ─── Pestaña de filtro (enlace renderizado en servidor) ──────────────────────
function FilterTab({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link href={href} className="filter-tab" aria-current={active ? 'page' : undefined}>
      {label}
      {!active && <LinkPendingSpinner />}
    </Link>
  )
}

export default freshOnNavigation(NotificationsPage)
