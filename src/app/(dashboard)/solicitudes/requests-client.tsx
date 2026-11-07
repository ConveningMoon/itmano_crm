'use client'

import { useMemo, useState, useTransition } from 'react'
import { CheckCircle2, Circle, Inbox } from 'lucide-react'
import { setRequestResponded, type PlatformRequestRow } from './actions'
import { FechaLocal } from '@/components/ui/local-date'

// Tabs Contacto | Soporte con checkbox de respondido. La lista llega del
// Server Component; el toggle es una server action con actualización optimista
// local (revalidatePath refresca el resto).

type Tab = 'contact' | 'support' | 'page'

const TABS: Tab[] = ['contact', 'support', 'page']

const TAB_LABEL: Record<Tab, string> = {
  contact: 'Contacto (landing)',
  support: 'Soporte (equipos)',
  page:    'Páginas',
}

const TAB_NOUN: Record<Tab, string> = {
  contact: 'contacto',
  support: 'soporte',
  page:    'páginas',
}

const CATEGORY_LABELS: Record<string, string> = {
  problema:    'Problema técnico',
  pregunta:    'Pregunta sobre el uso',
  cambio:      'Solicitud de cambio',
  otro:        'Otro',
  ai_capacity: 'Capacidad de IA',
}

function formatDate(iso: string) {
  return <FechaLocal fecha={iso} locale="es-419" opciones={{
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }} />
}

export function RequestsClient({ requests }: { requests: PlatformRequestRow[] }) {
  const [tab, setTab] = useState<Tab>('contact')
  // Overrides optimistas del checkbox mientras la action confirma.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  // Filas cuya action sigue en curso: su botón queda deshabilitado hasta que termine.
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [, startTransition] = useTransition()

  const byTab = useMemo(() => ({
    contact: requests.filter(r => r.kind === 'contact'),
    support: requests.filter(r => r.kind === 'support'),
    page:    requests.filter(r => r.kind === 'page'),
  }), [requests])

  const pendingCount = (kind: Tab) =>
    byTab[kind].filter(r => !(overrides[r.id] ?? r.responded)).length

  const toggle = (row: PlatformRequestRow) => {
    const next = !(overrides[row.id] ?? row.responded)
    setOverrides(prev => ({ ...prev, [row.id]: next }))
    setBusy(prev => ({ ...prev, [row.id]: true }))
    startTransition(async () => {
      const res = await setRequestResponded(row.id, next)
      if (!res.ok) setOverrides(prev => ({ ...prev, [row.id]: !next }))
      setBusy(prev => ({ ...prev, [row.id]: false }))
    })
  }

  const rows = byTab[tab]

  return (
    <>
      <div className="toolbar">
        <div className="filter-tabs" role="tablist" aria-label="Tipo de solicitud">
          {TABS.map(t => {
            const pending = pendingCount(t)
            return (
              <button
                key={t}
                type="button"
                role="tab"
                className="filter-tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
              >
                {TAB_LABEL[t]}
                {pending > 0 && <span className="filter-tab-count" aria-label={`${pending} sin responder`}>{pending}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty-card">
          <span className="empty-card-icon" aria-hidden="true"><Inbox size={18} /></span>
          No hay solicitudes de {TAB_NOUN[tab]} todavía.
        </div>
      ) : (
        <div className="feed" role="tabpanel">
          {rows.map(row => {
            const responded = overrides[row.id] ?? row.responded
            const meta = row.metadata ?? {}
            const metaEntries = Object.entries(meta).filter(([k]) => k !== 'category_label')
            const who = row.kind === 'contact'
              ? [row.requester_name, row.company].filter(Boolean).join(' · ') || row.requester_email
              : row.tenant_name ?? row.requester_email
            return (
              <div key={row.id} className="feed-row" data-done={responded || undefined}>
                <div className="feed-body">
                  <div className="feed-head">
                    <span className="feed-title">{who}</span>
                    {row.category && (
                      <span className="pill" style={{ '--tone': row.category === 'ai_capacity' ? 'var(--gold-1)' : 'var(--gold-3)' } as React.CSSProperties}>
                        {CATEGORY_LABELS[row.category] ?? row.category}
                      </span>
                    )}
                  </div>
                  <div className="feed-meta">
                    <a href={`mailto:${row.requester_email}`}>{row.requester_email}</a>
                    {row.requester_role && <> · {row.requester_role}</>}
                    {' · '}{formatDate(row.created_at)}
                  </div>

                  {row.subject && <div className="feed-title" style={{ display: 'block', marginTop: '10px' }}>{row.subject}</div>}
                  <p className="feed-text feed-text-pre" style={row.subject ? undefined : { marginTop: '10px' }}>{row.message}</p>

                  {/* Metadata interna (plan, uso de IA...) */}
                  {metaEntries.length > 0 && (
                    <div className="feed-facts">
                      {metaEntries.map(([k, v]) => (
                        <span key={k}>
                          <span style={{ textTransform: 'capitalize' }}>{k.replace(/_/g, ' ')}</span>: <b>{String(v)}</b>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="feed-side">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => toggle(row)}
                    aria-pressed={responded}
                    disabled={busy[row.id]}
                    aria-busy={busy[row.id] || undefined}
                  >
                    {responded
                      ? <CheckCircle2 size={15} aria-hidden="true" style={{ color: 'var(--gold-2)' }} />
                      : <Circle size={15} aria-hidden="true" />}
                    {responded ? 'Respondida' : 'Marcar respondida'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
