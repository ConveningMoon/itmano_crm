import Link from 'next/link'
import type { NotificationRow } from '@/lib/data/notifications'

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'ahora'
  if (diffMin < 60) return `hace ${diffMin} min`
  const h = Math.floor(diffMin / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} d`
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

// Feed compacto de notificaciones cross-tenant para el centro de control.
export function HubFeed({ notifications }: { notifications: NotificationRow[] }) {
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Actividad reciente
        </span>
        <Link href="/notifications" style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}>
          Ver todas →
        </Link>
      </div>

      {notifications.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
          No hay notificaciones todavía.
        </div>
      ) : (
        <div>
          {notifications.map((n, i) => (
            <div
              key={n.id}
              className="row-hover"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 16px',
                borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              <span
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: n.read ? 'var(--bg-overlay)' : 'var(--accent-gold)',
                }}
              />
              {n.tenantName && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 500,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: 'var(--text-muted)',
                    background: 'var(--bg-overlay)',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {n.tenantName}
                </span>
              )}
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {n.message}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
                {relativeTime(n.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
