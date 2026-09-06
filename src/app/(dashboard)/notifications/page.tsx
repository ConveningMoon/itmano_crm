import Link from 'next/link'
import {
  Flame, Mail, Trash2, CalendarPlus, FileText,
  TrendingUp, UserPlus, Bell, type LucideIcon,
} from 'lucide-react'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getNotifications } from '@/lib/data/notifications'
import { MarkReadOnMount } from './mark-read-on-mount'

// Force dynamic — reads cookies via the tenant context.
export const dynamic = 'force-dynamic'

// ─── Per-type presentation ──────────────────────────────────────────────────
interface TypeMeta { label: string; icon: LucideIcon; color: string }

const TYPE_CONFIG: Record<string, TypeMeta> = {
  hot_lead:              { label: 'Lead caliente',     icon: Flame,        color: 'var(--accent-coral)' },
  contact_us:            { label: 'Contact Us',        icon: Mail,         color: 'var(--accent-blue)' },
  contact_form_question: { label: 'Contacto',          icon: Mail,         color: 'var(--accent-blue)' },
  lead_deleted:          { label: 'Lead eliminado',    icon: Trash2,       color: 'var(--text-muted)' },
  event_added:           { label: 'Evento',            icon: CalendarPlus, color: 'var(--accent-teal)' },
  event_deleted:         { label: 'Evento archivado',  icon: Trash2,       color: 'var(--text-muted)' },
  lm_added:              { label: 'Lead magnet',       icon: FileText,     color: 'var(--accent-teal)' },
  lm_deleted:            { label: 'Lead magnet archivado', icon: Trash2,   color: 'var(--text-muted)' },
  // Historical types (no longer emitted, kept so older rows still render)
  score_threshold:       { label: 'Umbral de score',   icon: TrendingUp,   color: 'var(--accent-gold)' },
  lead_created:          { label: 'Nuevo lead',        icon: UserPlus,     color: 'var(--accent-green)' },
}

function metaFor(type: string): TypeMeta {
  return TYPE_CONFIG[type] ?? { label: type, icon: Bell, color: 'var(--text-secondary)' }
}

// Filter chips — the current emitted set (historical types still show under "Todas")
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

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
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
    <div style={{ maxWidth: '760px' }}>
      <MarkReadOnMount hasUnread={hasUnread} />

      {/* Filter chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
        <FilterChip label="Todas" href="/notifications" active={typeFilter === null} />
        {FILTER_TYPES.map(t => (
          <FilterChip
            key={t}
            label={metaFor(t).label}
            href={`/notifications?type=${t}`}
            active={typeFilter === t}
          />
        ))}
      </div>

      {notifications.length === 0 ? (
        <div
          style={{
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            backgroundColor: 'var(--bg-surface)',
            padding: '48px 24px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
          }}
        >
          No hay notificaciones todavía.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {notifications.map(n => {
            const meta = metaFor(n.type)
            const Icon = meta.icon
            const row = (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '14px 16px',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  backgroundColor: n.read ? 'var(--bg-surface)' : 'var(--bg-elevated)',
                }}
              >
                {/* Icon */}
                <div
                  style={{
                    flexShrink: 0,
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'var(--bg-overlay)',
                    color: meta.color,
                  }}
                >
                  <Icon size={16} strokeWidth={2} />
                </div>

                {/* Body */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {meta.label}
                    </span>
                    {isSuper && n.tenantName && (
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 500,
                          padding: '1px 7px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--bg-overlay)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {n.tenantName}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.45, wordBreak: 'break-word' }}>
                    {n.message}
                  </p>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {relativeTime(n.createdAt)}
                  </span>
                </div>

                {/* Unread dot */}
                {!n.read && (
                  <span
                    title="No leída"
                    style={{
                      flexShrink: 0,
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--accent-gold)',
                      marginTop: '6px',
                    }}
                  />
                )}
              </div>
            )

            // Link to the lead when the notification carries one
            return n.leadId ? (
              <Link key={n.id} href={`/leads/${n.leadId}`} style={{ textDecoration: 'none' }}>
                {row}
              </Link>
            ) : (
              <div key={n.id}>{row}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Filter chip (server-rendered link) ──────────────────────────────────────
function FilterChip({ label, href, active }: { label: string; href: string; active: boolean }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: '12px',
        fontWeight: 500,
        padding: '5px 12px',
        borderRadius: '6px',
        textDecoration: 'none',
        border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
        backgroundColor: active ? 'var(--accent-gold)' : 'var(--bg-surface)',
        color: active ? '#0B0C0E' : 'var(--text-secondary)',
      }}
    >
      {label}
    </Link>
  )
}
