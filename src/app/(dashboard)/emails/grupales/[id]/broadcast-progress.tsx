'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { BTN_DANGER, BTN_PRIMARY, CARD, ERROR, HINT, LABEL, LANG_LABEL } from '@/app/(dashboard)/properties/[id]/open-houses/ui'
import { FechaLocal } from '@/components/ui/local-date'
import type { BroadcastDetail, BroadcastMetrics } from '@/lib/data/email-broadcasts'
import { canCancelBroadcast, canResumeBroadcast } from '@/lib/broadcasts/model'
import { BroadcastStatusChip } from '../../broadcasts-panel'
import { cancelBroadcast, resumeBroadcast } from '../../broadcast-actions'
import { SKIP_REASON_TEXT } from './labels'

const FECHA: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ minWidth: '84px' }}>
      <div style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>{label}</div>
    </div>
  )
}

export function BroadcastProgress({ broadcast: b, metrics, issues }: {
  broadcast: BroadcastDetail
  metrics: BroadcastMetrics
  issues: { skipped: Record<string, number>; failed: { leadId: string; error: string | null }[] }
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [confirmingCancel, setConfirmingCancel] = useState(false)
  const [pending, start] = useTransition()

  // Mientras avanza, los conteos se refrescan solos.
  useEffect(() => {
    if (b.status !== 'sending') return
    const t = setInterval(() => router.refresh(), 5000)
    return () => clearInterval(t)
  }, [b.status, router])

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null)
    start(async () => {
      const res = await action()
      if (!res.ok) { setError(res.error); return }
      setConfirmingCancel(false)
      router.refresh()
    })
  }

  const skipped = Object.entries(issues.skipped)

  return (
    <>
      <div style={{ ...CARD, padding: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <BroadcastStatusChip status={b.status} />
            {b.status === 'pending' && b.scheduledAt && !b.lastError && <span>Sale el <FechaLocal fecha={b.scheduledAt} opciones={FECHA} /> o en la siguiente ejecución del envío, dentro de esa hora.</span>}
            {b.finishedAt && <span>Terminó el <FechaLocal fecha={b.finishedAt} opciones={FECHA} /></span>}
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {canResumeBroadcast(b.status) && (
              <button type="button" onClick={() => run(() => resumeBroadcast(b.id))} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
                {pending ? 'Reanudando…' : 'Reanudar envío'}
              </button>
            )}
            {canCancelBroadcast(b.status) && (confirmingCancel ? (
              <button type="button" onClick={() => run(() => cancelBroadcast(b.id))} disabled={pending} style={{ ...BTN_DANGER, opacity: pending ? 0.6 : 1 }}>
                {pending ? 'Cancelando…' : 'Sí, cancelar lo que falta'}
              </button>
            ) : (
              <button type="button" onClick={() => setConfirmingCancel(true)} style={BTN_DANGER}>Cancelar envío</button>
            ))}
          </div>
        </div>

        {b.lastError && <div style={{ ...ERROR, marginBottom: '14px' }}>{b.lastError}</div>}
        {error && <div style={{ ...ERROR, marginBottom: '14px' }}>{error}</div>}

        <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap' }}>
          <Stat label="Enviados" value={b.sentCount} />
          <Stat label="Omitidos" value={b.skippedCount} />
          <Stat label="Fallidos" value={b.failedCount} />
        </div>
      </div>

      {metrics.leads > 0 && (
        <div style={{ ...CARD, padding: '20px', marginBottom: '16px' }}>
          <span style={LABEL}>Resultado</span>
          <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', marginTop: '10px' }}>
            <Stat label="Clicks" value={metrics.clicked} />
            <Stat label="Respuestas" value={metrics.replied} />
            <Stat label="Rebotes" value={metrics.bounced} />
            <Stat label="Quejas de spam" value={metrics.complained} />
            <Stat label="Bajas" value={metrics.unsubscribed} />
          </div>
          <div style={{ ...HINT, marginTop: '12px' }}>
            Por lead, con actividad posterior al envío. Las aperturas no se miden: los clientes de correo las inflan.
          </div>
        </div>
      )}

      {(skipped.length > 0 || issues.failed.length > 0) && (
        <div style={{ ...CARD, padding: '20px', marginBottom: '16px' }}>
          <span style={LABEL}>Quién no lo recibió</span>
          <ul style={{ ...HINT, margin: '8px 0 0', paddingLeft: '18px' }}>
            {skipped.map(([reason, n]) => <li key={reason}>{n}: {SKIP_REASON_TEXT[reason] ?? reason}</li>)}
            {issues.failed.length > 0 && <li>{b.failedCount} fallaron al enviarse. Último error: {issues.failed[0].error ?? 'sin detalle'}</li>}
          </ul>
        </div>
      )}

      <div style={{ ...CARD, padding: '20px' }}>
        <span style={LABEL}>Contenido</span>
        {b.contents.map(c => (
          <div key={c.language} style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '8px' }}>
            <span style={{ color: 'var(--text-muted)' }}>{LANG_LABEL[c.language] ?? c.language}:</span> {c.subject}
          </div>
        ))}
      </div>
    </>
  )
}
