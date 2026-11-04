'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Plus, Send, Users } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { DataBlock, DataHead, DataScope, type DataColumn } from '@/components/ui/data-table'
import { LinkPendingSpinner } from '@/components/ui/loading-indicator'
import { FechaLocal } from '@/components/ui/local-date'
import type { BroadcastListItem, BroadcastMetrics } from '@/lib/data/email-broadcasts'
import { BROADCAST_STATUS_LABEL, type BroadcastStatus } from '@/lib/broadcasts/model'
import { createBroadcast } from './broadcast-actions'

const FECHA_CORTA: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }

// Dorado más vivo = más avanzado; apagado = sin actividad. Coral sólo en los
// estados que piden atención (pausado, fallido), siempre con icono y texto.
const STATUS_TONE: Record<BroadcastStatus, { tone: string; alert?: boolean }> = {
  draft:     { tone: 'mute' },
  pending:   { tone: 'gold' },
  sending:   { tone: 'gold' },
  paused:    { tone: 'coral', alert: true },
  sent:      { tone: 'green' },
  cancelled: { tone: 'mute' },
  failed:    { tone: 'coral', alert: true },
}

export function BroadcastStatusChip({ status }: { status: BroadcastStatus }) {
  const c = STATUS_TONE[status]
  return (
    <span className={c.alert ? 'pill' : 'pill pill-dot'} data-tone={c.tone}>
      {c.alert && <AlertTriangle size={11} aria-hidden="true" />}
      {BROADCAST_STATUS_LABEL[status]}
    </span>
  )
}

const COLS    = '34px minmax(0, 2fr) 120px 84px 64px 64px'
const COLS_MD = '34px minmax(0, 2fr) 120px 64px 64px'
const COLS_SM = 'minmax(0, 1fr) 96px'

const COLUMNS: DataColumn[] = [
  { label: '', hideSm: true },
  { label: 'Correo' },
  { label: 'Estado' },
  { label: 'Fecha', hideMd: true },
  { label: 'Leads', right: true, hideSm: true },
  { label: 'Clics', right: true, hideSm: true },
]

/** Clics sobre leads, en %. Sin leads no hay tasa que mostrar. */
function clickRate(m: BroadcastMetrics | undefined): string {
  if (!m || m.leads <= 0) return '—'
  return `${Math.round((m.clicked / m.leads) * 100)}%`
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

export function BroadcastsPanel({ broadcasts, senderError, metrics }: {
  broadcasts:  BroadcastListItem[]
  senderError: string | null
  /** id → métricas; `null` mientras llegan (streaming), para pintar la lista ya. */
  metrics:     Record<string, BroadcastMetrics> | null
}) {
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
        <DataScope cols={COLS} colsMd={COLS_MD} colsSm={COLS_SM}>
          <DataHead columns={COLUMNS} />
          <DataBlock>
            {broadcasts.map(b => {
              const m = metrics?.[b.id]
              const sent = b.status !== 'draft'
              const loading = sent && metrics === null
              const when = b.status === 'pending' && b.scheduledAt
                ? <>Sale el <FechaLocal fecha={b.scheduledAt} opciones={FECHA_CORTA} /></>
                : b.finishedAt
                  ? <>Terminó el <FechaLocal fecha={b.finishedAt} opciones={FECHA_CORTA} /></>
                  : <>Creado el <FechaLocal fecha={b.createdAt} opciones={FECHA_CORTA} /></>
              const shortDate = b.status === 'pending' && b.scheduledAt ? b.scheduledAt : (b.finishedAt ?? b.createdAt)
              return (
                <Link key={b.id} href={`/emails/grupales/${b.id}`} className="dt-grid dt-row" style={{ textDecoration: 'none' }}>
                  <div className="dt-hide-sm" aria-hidden="true" style={{
                    width: '30px', height: '30px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--accent-gold)', background: 'color-mix(in srgb, var(--accent-gold) 12%, transparent)',
                  }}><Send size={14} /></div>

                  <div className="dt-cell-main">
                    <span className="dt-title">{b.name} <LinkPendingSpinner /></span>
                    <div className="dt-meta">
                      <span className="dt-show-md">{when}</span>
                      {sent && (
                        <span>
                          {b.sentCount} enviados{b.skippedCount > 0 ? ` · ${b.skippedCount} omitidos` : ''}{b.failedCount > 0 ? ` · ${b.failedCount} fallidos` : ''}
                        </span>
                      )}
                      {!sent && <span className="dt-hide-md">Sin enviar</span>}
                    </div>
                  </div>

                  <span style={{ justifySelf: 'start' }}><BroadcastStatusChip status={b.status} /></span>

                  <span className="dt-hide-md" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {sent || b.scheduledAt ? <FechaLocal fecha={shortDate} opciones={FECHA_CORTA} /> : '—'}
                  </span>

                  <span className="dt-hide-sm dt-r dt-num">
                    {loading ? <Skeleton w="28px" h={12} r={3} style={{ marginLeft: 'auto' }} /> : sent && m && m.leads > 0 ? m.leads : '—'}
                  </span>
                  <span className="dt-hide-sm dt-r dt-num">
                    {loading ? <Skeleton w="28px" h={12} r={3} style={{ marginLeft: 'auto' }} /> : sent ? clickRate(m) : '—'}
                  </span>
                </Link>
              )
            })}
          </DataBlock>
        </DataScope>
      )}
    </>
  )
}
