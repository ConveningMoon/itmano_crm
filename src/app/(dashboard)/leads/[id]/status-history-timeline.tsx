import { ArrowRight } from 'lucide-react'
import { STATUS_CONFIG } from '@/lib/config'
import { StaggerGroup, StaggerItem } from '@/components/motion/primitives'
import type { LeadStatus } from '@/lib/types'
import type { StatusChange } from '@/lib/data/lead-status-history'

// Who/what drove the transition (lead_status_history.source).
const SOURCE_LABELS: Record<string, string> = {
  trigger: 'Automático',
  agent:   'Agente',
  system:  'Sistema',
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function StatusBadge({ status }: { status: string }) {
  const cfg   = STATUS_CONFIG[status as LeadStatus]
  const color = cfg?.color   ?? 'var(--text-muted)'
  const bg    = cfg?.bgColor ?? 'var(--bg-overlay)'
  return (
    <span style={{
      fontSize: '11px', fontWeight: 500, padding: '2px 8px', borderRadius: '6px',
      background: bg, color, border: `1px solid ${color}33`, whiteSpace: 'nowrap',
    }}>
      {cfg?.label ?? status}
    </span>
  )
}

export function StatusHistoryTimeline({ changes }: { changes: StatusChange[] }) {
  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', overflow: 'hidden', marginTop: '24px',
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Historial de estados · {changes.length}
        </span>
      </div>

      {changes.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          Sin cambios de estado aún
        </div>
      ) : (
        <StaggerGroup stagger={0.04} style={{ padding: '18px 20px' }}>
          {changes.map((c, i) => {
            const cfg      = STATUS_CONFIG[c.toStatus as LeadStatus]
            const dotColor = cfg?.color   ?? 'var(--text-muted)'
            const dotRing  = cfg?.bgColor ?? 'transparent'
            const isLast   = i === changes.length - 1
            return (
              <StaggerItem key={c.id} style={{ display: 'flex', gap: '14px' }}>
                {/* Dot + connector */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '12px', flexShrink: 0 }}>
                  <div style={{
                    width: '11px', height: '11px', borderRadius: '50%', background: dotColor,
                    marginTop: '3px', boxShadow: `0 0 0 3px ${dotRing}`, flexShrink: 0,
                  }} />
                  {!isLast && <div style={{ flex: 1, width: '1px', background: 'var(--border-subtle)', marginTop: '4px', minHeight: '20px' }} />}
                </div>

                {/* Content */}
                <div style={{ flex: 1, paddingBottom: isLast ? 0 : '20px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {c.fromStatus && (
                      <>
                        <StatusBadge status={c.fromStatus} />
                        <ArrowRight size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      </>
                    )}
                    <StatusBadge status={c.toStatus} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', fontSize: '11px', color: 'var(--text-muted)' }}>
                    <span>{formatDateTime(c.changedAt)}</span>
                    <span>·</span>
                    <span>{SOURCE_LABELS[c.source] ?? c.source}</span>
                  </div>
                </div>
              </StaggerItem>
            )
          })}
        </StaggerGroup>
      )}
    </div>
  )
}
