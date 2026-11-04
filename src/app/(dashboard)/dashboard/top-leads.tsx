'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Clock, Flame, Timer } from 'lucide-react'
import type { TopLead } from '@/lib/data/dashboard-leads'
import { timeAgo } from '../activity/activity-ui'

type Mode = 'hot' | 'recent'

const MODES: { key: Mode; label: string; Icon: typeof Flame }[] = [
  { key: 'hot', label: 'Más calientes', Icon: Flame },
  { key: 'recent', label: 'Más recientes', Icon: Clock },
]

function initials(l: TopLead): string {
  return ((l.firstName.charAt(0) + l.lastName.charAt(0)).toUpperCase()) || '?'
}

// Los dos Top 5 llegan juntos desde el servidor: el switch sólo cambia cuál se
// pinta, así que no hay consulta ni transición al alternar.
export function TopLeads({ hot, recent, agentNames }: {
  hot: TopLead[]
  recent: TopLead[]
  agentNames: Record<string, string>
}) {
  const [mode, setMode] = useState<Mode>('hot')
  const rows = mode === 'hot' ? hot : recent

  return (
    <div>
      <div className="top5-switch" role="radiogroup" aria-label="Ordenar Top 5">
        {MODES.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={mode === key}
            onClick={() => setMode(key)}
          >
            <Icon size={13} strokeWidth={2} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="top5-empty">Todavía no hay leads activos en tu cartera.</div>
      ) : (
        <div>
          {rows.map((l, i) => {
            const agent = l.agentId ? agentNames[l.agentId] : undefined
            return (
              <Link key={l.id} href={`/leads/${l.id}`} className="top5-row row-hover">
                <span className="top5-rank">{i + 1}</span>
                <span className="top5-avatar" aria-hidden="true">{initials(l)}</span>
                <span className="top5-main">
                  <span className="top5-name">{l.firstName} {l.lastName}</span>
                  <span className="top5-sub">{l.channelName ?? '—'} · {agent ?? '—'}</span>
                </span>
                <span className="top5-right">
                  {l.urgency === 'hoy' && (
                    <span className="top5-today"><Timer size={11} strokeWidth={2} aria-hidden="true" />Hoy</span>
                  )}
                  {mode === 'hot' ? (
                    <>
                      <span className="top5-bar" aria-hidden="true">
                        <i style={{ width: `${Math.min(100, Math.max(0, l.score ?? 0))}%` }} />
                      </span>
                      <span className="top5-score">{l.score ?? '—'}</span>
                    </>
                  ) : (
                    <span className="top5-sub" suppressHydrationWarning>{timeAgo(l.createdAt)}</span>
                  )}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
