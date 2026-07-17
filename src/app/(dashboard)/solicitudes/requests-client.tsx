'use client'

import { useMemo, useState, useTransition } from 'react'
import { CheckCircle2, Circle, Inbox } from 'lucide-react'
import { setRequestResponded, type PlatformRequestRow } from './actions'

// Tabs Contacto | Soporte con checkbox de respondido. La lista llega del
// Server Component; el toggle es una server action con actualización optimista
// local (revalidatePath refresca el resto).

type Tab = 'contact' | 'support'

const CATEGORY_LABELS: Record<string, string> = {
  problema:    'Problema técnico',
  pregunta:    'Pregunta sobre el uso',
  cambio:      'Solicitud de cambio',
  otro:        'Otro',
  ai_capacity: 'Capacidad de IA',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-419', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export function RequestsClient({ requests }: { requests: PlatformRequestRow[] }) {
  const [tab, setTab] = useState<Tab>('contact')
  // Overrides optimistas del checkbox mientras la action confirma.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [, startTransition] = useTransition()

  const byTab = useMemo(() => ({
    contact: requests.filter(r => r.kind === 'contact'),
    support: requests.filter(r => r.kind === 'support'),
  }), [requests])

  const pendingCount = (kind: Tab) =>
    byTab[kind].filter(r => !(overrides[r.id] ?? r.responded)).length

  const toggle = (row: PlatformRequestRow) => {
    const next = !(overrides[row.id] ?? row.responded)
    setOverrides(prev => ({ ...prev, [row.id]: next }))
    startTransition(async () => {
      const res = await setRequestResponded(row.id, next)
      if (!res.ok) setOverrides(prev => ({ ...prev, [row.id]: !next }))
    })
  }

  const rows = byTab[tab]

  return (
    <>
      <style>{`
        .req-card { transition: border-color 0.15s; }
        .req-card:hover { border-color: var(--border-accent) !important; }
        .req-check { cursor: pointer; background: none; border: none; padding: 0; display: inline-flex; align-items: center; gap: 6px; }
      `}</style>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
        {(['contact', 'support'] as Tab[]).map(t => {
          const active = tab === t
          const pending = pendingCount(t)
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '7px 16px', fontSize: '13px', fontWeight: 500,
                borderRadius: '8px', cursor: 'pointer',
                background: active ? 'var(--bg-elevated)' : 'transparent',
                color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                border: `1px solid ${active ? 'var(--border-accent)' : 'var(--border-subtle)'}`,
              }}
            >
              {t === 'contact' ? 'Contacto (landing)' : 'Soporte (equipos)'}
              {pending > 0 && (
                <span style={{
                  fontSize: '11px', fontWeight: 500, color: 'var(--accent-gold)',
                  background: 'rgba(201,169,110,0.15)', padding: '1px 7px', borderRadius: '10px',
                }}>
                  {pending}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {rows.length === 0 ? (
        <div style={{
          background: 'var(--bg-surface)', border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: '12px', padding: '56px 48px', textAlign: 'center',
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'rgba(201,169,110,0.1)', margin: '0 auto 14px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Inbox size={18} color="var(--accent-gold)" />
          </div>
          <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            No hay solicitudes de {tab === 'contact' ? 'contacto' : 'soporte'} todavía.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {rows.map(row => {
            const responded = overrides[row.id] ?? row.responded
            const meta = row.metadata ?? {}
            const metaEntries = Object.entries(meta).filter(([k]) => k !== 'category_label')
            return (
              <div
                key={row.id}
                className="req-card"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '16px 20px',
                  opacity: responded ? 0.6 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    {/* Identidad */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                        {row.kind === 'contact'
                          ? [row.requester_name, row.company].filter(Boolean).join(' · ') || row.requester_email
                          : row.tenant_name ?? row.requester_email}
                      </span>
                      {row.category && (
                        <span style={{
                          fontSize: '10px', fontWeight: 500, letterSpacing: '0.05em', textTransform: 'uppercase',
                          color: row.category === 'ai_capacity' ? 'var(--accent-teal)' : 'var(--accent-gold)',
                          background: row.category === 'ai_capacity' ? 'rgba(90,175,160,0.12)' : 'rgba(201,169,110,0.1)',
                          padding: '2px 8px', borderRadius: '10px',
                        }}>
                          {CATEGORY_LABELS[row.category] ?? row.category}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px' }}>
                      <a href={`mailto:${row.requester_email}`} style={{ color: 'var(--accent-blue)', textDecoration: 'none' }}>
                        {row.requester_email}
                      </a>
                      {row.requester_role && <> · {row.requester_role}</>}
                      {' · '}{formatDate(row.created_at)}
                    </div>
                  </div>

                  {/* Checkbox respondido */}
                  <button className="req-check" onClick={() => toggle(row)} aria-pressed={responded}>
                    {responded
                      ? <CheckCircle2 size={17} color="var(--accent-green)" />
                      : <Circle size={17} color="var(--text-muted)" />}
                    <span style={{ fontSize: '12px', color: responded ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                      {responded ? 'Respondida' : 'Marcar respondida'}
                    </span>
                  </button>
                </div>

                {/* Asunto + mensaje */}
                {row.subject && (
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '12px' }}>
                    {row.subject}
                  </div>
                )}
                <p style={{
                  fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6,
                  margin: `${row.subject ? '6px' : '12px'} 0 0`, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                }}>
                  {row.message}
                </p>

                {/* Metadata interna (plan, uso de IA...) */}
                {metaEntries.length > 0 && (
                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '12px' }}>
                    {metaEntries.map(([k, v]) => (
                      <span key={k} style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>:{' '}
                        <span style={{ color: 'var(--text-secondary)' }}>{String(v)}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
