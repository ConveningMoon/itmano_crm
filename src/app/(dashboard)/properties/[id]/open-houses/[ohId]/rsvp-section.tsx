'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { OpenHouseRsvp } from '@/lib/data/open-houses'
import { setRsvpAttendance } from '../../../open-house-actions'
import { CARD, ERROR, HINT } from '../ui'

const SOURCE_LABEL: Record<OpenHouseRsvp['source'], string> = { email: 'Correo', web: 'Web', crm: 'CRM' }

export function RsvpSection({ rsvps, eventStarted }: { rsvps: OpenHouseRsvp[]; eventStarted: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const yes = rsvps.filter(r => r.response === 'yes')
  const guests = yes.reduce((n, r) => n + r.guests, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>Asistencia</h2>
        <span style={HINT}>
          {yes.length} {yes.length === 1 ? 'confirmado' : 'confirmados'}{guests ? ` (+${guests} acompañantes)` : ''} · {rsvps.length - yes.length} no pueden
        </span>
      </div>
      {error && <div style={ERROR}>{error}</div>}
      {rsvps.length === 0 ? (
        <div style={{ ...CARD, padding: '20px', ...HINT }}>Todavía nadie respondió.</div>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          {rsvps.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', borderTop: i ? '1px solid var(--border-subtle)' : undefined, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <Link href={`/leads/${r.leadId}`} style={{ fontSize: '13px', color: 'var(--text-primary)', textDecoration: 'none' }}>{r.leadName}</Link>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.leadEmail ?? ''}</div>
              </div>
              <span style={{ fontSize: '12px', color: r.response === 'yes' ? 'var(--accent-green)' : 'var(--text-muted)', minWidth: '90px' }}>
                {r.response === 'yes' ? `Asistirá${r.guests ? ` +${r.guests}` : ''}` : 'No puede'}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '50px' }}>{SOURCE_LABEL[r.source]}</span>
              {eventStarted && r.response === 'yes' && (
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={r.attended === true}
                    disabled={pending}
                    onChange={e => {
                      const attended = e.target.checked
                      setError(null)
                      start(async () => {
                        const res = await setRsvpAttendance(r.id, attended)
                        if (!res.ok) setError(res.error); else router.refresh()
                      })
                    }}
                  />
                  Asistió
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
