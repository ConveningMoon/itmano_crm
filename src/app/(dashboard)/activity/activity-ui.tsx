import {
  ArrowRightCircle, Mail, FileDown, Calendar, UserPlus, CheckCircle2,
} from 'lucide-react'
import type { ActivityItem } from '@/lib/data/activity'

// Shared activity render — used by both the dashboard block and /activity so
// the two stay visually identical. Server-safe (no hooks, no client state).

export const EVENT_META: Record<string, { icon: string; color: string }> = {
  lead_created:   { icon: 'UserPlus',         color: 'var(--gold-2)' },
  status_changed: { icon: 'ArrowRightCircle', color: 'var(--gold-3)' },
  email_sent:     { icon: 'Mail',             color: 'var(--gold-1)' },
  download:       { icon: 'FileDown',         color: 'var(--gold-4)' },
  appointment:    { icon: 'Calendar',         color: 'var(--gold-3)' },
  process_closed: { icon: 'CheckCircle2',     color: 'var(--gold-2)' },
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1)   return 'Ahora mismo'
  if (mins < 60)  return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours} hora${hours > 1 ? 's' : ''}`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Ayer'
  return `Hace ${days} días`
}

function ActivityIcon({ name }: { name: string }) {
  const props = { size: 16 }
  switch (name) {
    case 'ArrowRightCircle': return <ArrowRightCircle {...props} />
    case 'Mail':             return <Mail {...props} />
    case 'FileDown':         return <FileDown {...props} />
    case 'Calendar':         return <Calendar {...props} />
    case 'UserPlus':         return <UserPlus {...props} />
    case 'CheckCircle2':     return <CheckCircle2 {...props} />
    default:                 return null
  }
}

// Una fila de actividad (icono + texto + tiempo relativo) con las clases .feed-*
// de dashboard-ui.css. Las filas van como hermanas directas dentro de su
// contenedor: el separador entre ellas lo pone el CSS. `showTenant` añade la
// etiqueta del tenant en la vista multi-tenant del super_admin; `compact` es la
// versión del Dashboard, con menos aire.
export function ActivityRow({ item, showTenant = false, compact = false }: {
  item:        ActivityItem
  showTenant?: boolean
  compact?:    boolean
}) {
  const meta = EVENT_META[item.type] ?? { icon: 'ArrowRightCircle', color: 'var(--gold-2)' }
  return (
    <div className="feed-row" style={compact ? { paddingBlock: '9px' } : undefined}>
      <span className="feed-icon" style={{ '--tone': meta.color } as React.CSSProperties} aria-hidden="true">
        <ActivityIcon name={meta.icon} />
      </span>
      <div className="feed-body">
        <div className="feed-head">
          <span className="feed-text" style={{ margin: 0 }}>{item.description}</span>
          {showTenant && item.tenantName && <span className="feed-tag">{item.tenantName}</span>}
        </div>
        <div className="feed-meta">{item.author} · {timeAgo(item.createdAt)}</div>
      </div>
    </div>
  )
}
