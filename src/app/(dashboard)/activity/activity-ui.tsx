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

// One activity row (icon circle + text + relative time). `showTenant` adds the
// tenant badge for the super_admin multi-tenant view.
export function ActivityRow({ item, showTenant = false }: { item: ActivityItem; showTenant?: boolean }) {
  const meta = EVENT_META[item.type] ?? { icon: 'ArrowRightCircle', color: 'var(--gold-2)' }
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '8px 0' }}>
      <div style={{
        width: '28px', height: '28px', borderRadius: '50%',
        background: `color-mix(in srgb, ${meta.color} 12%, transparent)`, color: meta.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <ActivityIcon name={meta.icon} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span>{item.description}</span>
          {showTenant && item.tenantName && (
            <span style={{
              fontSize: '10px', fontWeight: 500, padding: '1px 7px', borderRadius: '4px',
              background: 'var(--bg-overlay)', color: 'var(--text-secondary)',
            }}>
              {item.tenantName}
            </span>
          )}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {item.author} · {timeAgo(item.createdAt)}
        </div>
      </div>
    </div>
  )
}
