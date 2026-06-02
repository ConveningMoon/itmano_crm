'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, ChevronDown, Mail, Phone, Check, Clock } from 'lucide-react'
import type { SubmissionRow } from '@/lib/data/form-submissions'
import { toggleSubmissionResponded } from '../actions'

function relativeTime(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60)  return 'hace un momento'
  const mins = Math.floor(secs / 60)
  if (mins < 60)  return `hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.floor(hours / 24)
  if (days < 7)   return `hace ${days} d`
  return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// Only contact_form / event submissions carry a respondible state.
function usesRespondedState(channelType: string): boolean {
  return channelType === 'contact_form' || channelType === 'event'
}

function SubmissionItem({
  sub, channelType, open, onToggle,
}: {
  sub:         SubmissionRow
  channelType: string
  open:        boolean
  onToggle:    () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const hasStatus = usesRespondedState(channelType)

  const lead = sub.lead
  const name = lead ? `${lead.firstName} ${lead.lastName}`.trim() || 'Lead' : 'Lead'

  function handleToggleResponded(e: React.MouseEvent) {
    e.stopPropagation()
    setError(null)
    startTransition(async () => {
      const res = await toggleSubmissionResponded(sub.id)
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Collapsed header (clickable) */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
          padding: '12px 16px', background: open ? 'var(--bg-elevated)' : 'transparent',
          border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              : <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>{name}</span>

        {hasStatus && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
            letterSpacing: '0.04em', textTransform: 'uppercase',
            color:      sub.responded ? 'var(--accent-green)' : 'var(--accent-gold)',
            background:  sub.responded ? 'rgba(107,163,104,0.12)' : 'rgba(201,169,110,0.12)',
          }}>
            {sub.responded ? <Check size={10} /> : <Clock size={10} />}
            {sub.responded ? 'Respondida' : 'Pendiente'}
          </span>
        )}

        <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0 }}>
          {relativeTime(sub.submittedAt)}
        </span>
      </button>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: '4px 16px 18px 41px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Q&A */}
          <div>
            <div style={SECTION_LABEL}>Respuestas</div>
            {sub.answers.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Sin respuestas registradas.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sub.answers.map((a, i) => (
                  <div key={i}>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '1px' }}>
                      {a.question || a.key}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                      {a.label ?? (a.value === null || a.value === undefined ? '—' : String(a.value))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Personal data + actions */}
          {lead && (
            <div>
              <div style={SECTION_LABEL}>Contacto</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <Link href={`/leads/${sub.leadId}`} style={{ fontSize: '13px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500, width: 'fit-content' }}>
                  {`${lead.firstName} ${lead.lastName}`.trim() || 'Ver lead'} →
                </Link>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{lead.email}</div>
                {lead.phone && (
                  <a href={`tel:${lead.phone}`} style={{ fontSize: '13px', color: 'var(--accent-blue)', textDecoration: 'none', width: 'fit-content' }}>
                    {lead.phone}
                  </a>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                <a
                  href={`mailto:${lead.email}`}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: '12px', fontWeight: 500, color: 'var(--bg-base)',
                    background: 'var(--accent-gold)', borderRadius: '8px',
                    padding: '7px 14px', textDecoration: 'none',
                  }}
                >
                  <Mail size={13} />
                  Enviar correo
                </a>
                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)',
                      background: 'transparent', border: '1px solid var(--border-subtle)',
                      borderRadius: '8px', padding: '7px 14px', textDecoration: 'none',
                    }}
                  >
                    <Phone size={13} />
                    Llamar
                  </a>
                )}

                {hasStatus && (
                  <button
                    onClick={handleToggleResponded}
                    disabled={pending}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      fontSize: '12px', fontWeight: 500,
                      color: sub.responded ? 'var(--text-secondary)' : 'var(--accent-green)',
                      background: 'transparent',
                      border: `1px solid ${sub.responded ? 'var(--border-subtle)' : 'rgba(107,163,104,0.4)'}`,
                      borderRadius: '8px', padding: '7px 14px',
                      cursor: pending ? 'default' : 'pointer', opacity: pending ? 0.6 : 1,
                    }}
                  >
                    {sub.responded ? <Clock size={13} /> : <Check size={13} />}
                    {pending ? '…' : sub.responded ? 'Marcar como pendiente' : 'Marcar como respondida'}
                  </button>
                )}
              </div>
              {error && (
                <div style={{ fontSize: '11px', color: '#E04040', marginTop: '8px' }}>{error}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: '10px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em',
  color: 'var(--text-muted)', marginBottom: '8px',
}

export function SubmissionsList({
  submissions, channelType,
}: {
  submissions: SubmissionRow[]
  channelType: string
}) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Solicitudes · {submissions.length} en total
        </span>
      </div>

      {submissions.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          No hay solicitudes para esta fuente todavía.
        </div>
      ) : (
        <div>
          {submissions.map(sub => (
            <SubmissionItem
              key={sub.id}
              sub={sub}
              channelType={channelType}
              open={openId === sub.id}
              onToggle={() => setOpenId(openId === sub.id ? null : sub.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
