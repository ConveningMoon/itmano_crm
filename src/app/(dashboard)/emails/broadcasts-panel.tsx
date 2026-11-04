'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Users } from 'lucide-react'
import { LinkPendingSpinner } from '@/components/ui/loading-indicator'
import { FechaLocal } from '@/components/ui/local-date'
import type { BroadcastListItem } from '@/lib/data/email-broadcasts'
import { BROADCAST_STATUS_LABEL, type BroadcastStatus } from '@/lib/broadcasts/model'
import { createBroadcast } from './broadcast-actions'

const FECHA: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

const STATUS_COLOR: Record<BroadcastStatus, { color: string; bg: string }> = {
  draft:     { color: 'var(--text-muted)',     bg: 'var(--bg-elevated)' },
  pending:   { color: 'var(--accent-blue)',    bg: 'rgba(91,142,201,0.12)' },
  sending:   { color: 'var(--accent-gold)',    bg: 'rgba(201,169,110,0.12)' },
  paused:    { color: 'var(--accent-coral)',   bg: 'rgba(201,123,107,0.12)' },
  sent:      { color: 'var(--accent-teal)',    bg: 'rgba(90,175,160,0.12)' },
  cancelled: { color: 'var(--text-secondary)', bg: 'var(--bg-elevated)' },
  failed:    { color: 'var(--accent-coral)',   bg: 'rgba(201,123,107,0.12)' },
}

export function BroadcastStatusChip({ status }: { status: BroadcastStatus }) {
  const c = STATUS_COLOR[status]
  return (
    <span style={{ fontSize: '11px', fontWeight: 500, padding: '3px 9px', borderRadius: '999px', color: c.color, background: c.bg, whiteSpace: 'nowrap' }}>
      {BROADCAST_STATUS_LABEL[status]}
    </span>
  )
}

function NewBroadcastButton() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function create() {
    setError(null)
    start(async () => {
      const res = await createBroadcast()
      if (!res.ok) { setError(res.error); return }
      router.push(`/emails/grupales/${res.id}`)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
      <button type="button" onClick={create} disabled={pending} className="btn btn-primary btn-cta" style={{ opacity: pending ? 0.6 : 1 }}>
        <Plus size={14} />
        {pending ? 'Creando…' : 'Nuevo correo grupal'}
      </button>
      {error && <span style={{ fontSize: '12px', color: 'var(--alert)', maxWidth: '420px', textAlign: 'right', lineHeight: 1.5 }}>{error}</span>}
    </div>
  )
}

export function BroadcastsPanel({ broadcasts, senderError }: { broadcasts: BroadcastListItem[]; senderError: string | null }) {
  return (
    <>
      <div className="toolbar">
        <span className="toolbar-meta">
          {broadcasts.length === 0
            ? 'Sin correos grupales todavía'
            : `${broadcasts.length} ${broadcasts.length === 1 ? 'correo grupal' : 'correos grupales'}`}
        </span>
        {!senderError && <div className="page-actions"><NewBroadcastButton /></div>}
      </div>

      {senderError && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px',
          padding: '16px 20px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '16px',
        }}>
          {senderError}
        </div>
      )}

      {broadcasts.length === 0 ? (
        !senderError && (
          <div style={{ background: 'var(--bg-surface)', border: '1px dashed var(--border-hover)', borderRadius: '12px', padding: '56px 24px', textAlign: 'center' }}>
            <Users size={20} color="var(--accent-gold)" style={{ marginBottom: '12px' }} />
            <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Escríbele a un grupo de leads
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto', lineHeight: 1.6 }}>
              Elige la audiencia por etiqueta, etapa, agente o fuente, o marca los leads uno por uno.
              Cada uno lo recibe en su idioma y firmado por su agente.
            </div>
          </div>
        )
      ) : (
        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', overflow: 'hidden' }}>
          {broadcasts.map((b, i) => (
            <Link
              key={b.id}
              href={`/emails/grupales/${b.id}`}
              className="row-hover"
              style={{
                display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '14px 20px',
                borderTop: i === 0 ? 'none' : '1px solid var(--border-subtle)', textDecoration: 'none',
              }}
            >
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.name} <LinkPendingSpinner />
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {b.status === 'pending' && b.scheduledAt
                    ? <>Sale el <FechaLocal fecha={b.scheduledAt} opciones={FECHA} /></>
                    : b.finishedAt
                      ? <>Terminó el <FechaLocal fecha={b.finishedAt} opciones={FECHA} /></>
                      : <>Creado el <FechaLocal fecha={b.createdAt} opciones={FECHA} /></>}
                </div>
              </div>
              {b.status !== 'draft' && (
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {b.sentCount} enviados{b.skippedCount > 0 ? ` · ${b.skippedCount} omitidos` : ''}{b.failedCount > 0 ? ` · ${b.failedCount} fallidos` : ''}
                </span>
              )}
              <BroadcastStatusChip status={b.status} />
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
