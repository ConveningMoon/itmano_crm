'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Mail } from 'lucide-react'
import type { LeadEmailReply } from '@/lib/data/lead-email-replies'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-ES', {
    day:    '2-digit',
    month:  'short',
    year:   'numeric',
    hour:   '2-digit',
    minute: '2-digit',
  })
}

function ReplyItem({ reply, open, onToggle }: {
  reply:    LeadEmailReply
  open:     boolean
  onToggle: () => void
}) {
  const subject = reply.subject?.trim() || '(sin asunto)'

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px',
          background: open ? 'var(--bg-elevated)' : 'transparent',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        {open
          ? <ChevronDown  size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          : <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}

        <Mail size={13} style={{ color: 'var(--accent-teal)', flexShrink: 0 }} />

        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {subject}
        </span>

        <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
          {formatDateTime(reply.receivedAt)}
        </span>
      </button>

      {open && (
        <div style={{ padding: '4px 16px 20px 41px' }}>
          <div style={{ fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: '10px' }}>
            De: {reply.fromEmail}
          </div>

          {reply.bodyText ? (
            // Render plain-text only. Pre-wrap preserves line breaks from the original email.
            // HTML is NEVER rendered here — body_text is stored as plain-text at capture time.
            <pre style={{
              fontFamily:  'inherit',
              fontSize:    '13px',
              color:       'var(--text-secondary)',
              lineHeight:  '1.65',
              whiteSpace:  'pre-wrap',
              wordBreak:   'break-word',
              margin:      0,
              padding:     0,
              background:  'transparent',
            }}>
              {reply.bodyText}
            </pre>
          ) : (
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
              Sin contenido de texto disponible.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function LeadEmailRepliesList({ replies }: { replies: LeadEmailReply[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div style={{
      background:   'var(--bg-surface)',
      border:       '1px solid var(--border-subtle)',
      borderRadius: '12px',
      overflow:     'hidden',
    }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Respuestas por email · {replies.length}
        </span>
      </div>

      {replies.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          Sin respuestas aún
        </div>
      ) : (
        <div>
          {replies.map(r => (
            <ReplyItem
              key={r.id}
              reply={r}
              open={openId === r.id}
              onToggle={() => setOpenId(openId === r.id ? null : r.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
