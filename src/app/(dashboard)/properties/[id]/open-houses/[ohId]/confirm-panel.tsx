'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send, Users } from 'lucide-react'
import type { AudienceSummary } from '@/lib/open-houses/audience'
import { SKIP_REASON_LABEL, type SkipReason } from '@/lib/open-houses/model'
import { confirmOpenHouse, previewOpenHouseAudience } from '../../../open-house-actions'
import { BTN_GHOST, BTN_PRIMARY, CARD, ERROR, HINT, LANG_LABEL } from '../ui'

// Confirmar es el paso irreversible: publica la cuenta regresiva y programa el
// anuncio. Por eso se hace en dos tiempos: primero se CALCULA la audiencia y
// se muestra quién la recibe y quién no; después se confirma con ese número.
// Si la audiencia cambió entre medio, el servidor lo rechaza y pide revisar.

export function ConfirmPanel({
  openHouseId, sendsOnConfirm, disabledReason,
}: {
  openHouseId:    string
  sendsOnConfirm: boolean
  disabledReason: string | null
}) {
  const router = useRouter()
  const [summary, setSummary] = useState<AudienceSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [pending, start] = useTransition()

  function calculate() {
    setError(null); setAsking(false)
    start(async () => {
      const res = await previewOpenHouseAudience(openHouseId)
      if (!res.ok) { setError(res.error); return }
      setSummary(res.summary)
    })
  }

  function confirm() {
    if (!summary) return
    setError(null)
    start(async () => {
      const res = await confirmOpenHouse(openHouseId, summary.toSend)
      if (!res.ok) {
        setError(res.error)
        setAsking(false)
        // Si la audiencia cambió, se recalcula para mostrar el número nuevo.
        const again = await previewOpenHouseAudience(openHouseId)
        if (again.ok) setSummary(again.summary)
        return
      }
      router.refresh()
    })
  }

  const skipped = summary ? (Object.entries(summary.skipped) as [SkipReason, number][]).filter(([, n]) => n > 0) : []

  return (
    <div style={{ ...CARD, padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px', borderColor: 'rgba(201,169,110,0.35)' }}>
      <div>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Confirmar open house</div>
        <div style={{ ...HINT, marginTop: '4px' }}>
          Al confirmar, la cuenta regresiva aparece en la web y el anuncio {sendsOnConfirm ? 'sale de inmediato' : 'queda programado'}.
          Después ya no se edita: se reprograma (avisando a quien lo recibió) o se cancela.
        </div>
      </div>

      {disabledReason ? (
        <div style={ERROR}>{disabledReason}</div>
      ) : (
        <>
          {!summary ? (
            <button onClick={calculate} disabled={pending} style={{ ...BTN_GHOST, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Users size={13} /> {pending ? 'Calculando…' : 'Calcular audiencia'}
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                <strong style={{ fontSize: '20px', color: 'var(--accent-gold)' }}>{summary.toSend}</strong>{' '}
                de {summary.total} leads recibirían el anuncio
              </div>
              {Object.keys(summary.byLanguage).length > 0 && (
                <div style={HINT}>
                  {Object.entries(summary.byLanguage).map(([l, n]) => `${LANG_LABEL[l] ?? l}: ${n}`).join(' · ')}
                </div>
              )}
              {skipped.length > 0 && (
                <ul style={{ margin: 0, paddingLeft: '18px', ...HINT }}>
                  {skipped.map(([reason, n]) => <li key={reason}>{n} no lo recibirían: {SKIP_REASON_LABEL[reason].toLowerCase()}</li>)}
                </ul>
              )}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '4px' }}>
                <button onClick={calculate} disabled={pending} style={BTN_GHOST}>Recalcular</button>
                {!asking ? (
                  <button onClick={() => setAsking(true)} disabled={pending || summary.toSend === 0} style={{ ...BTN_PRIMARY, opacity: summary.toSend === 0 ? 0.5 : 1 }}>
                    Confirmar open house
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {sendsOnConfirm
                        ? `Se enviarán ${summary.toSend} correos ahora. ¿Confirmas?`
                        : `Se programarán ${summary.toSend} correos. ¿Confirmas?`}
                    </span>
                    <button onClick={() => setAsking(false)} style={BTN_GHOST}>No</button>
                    <button onClick={confirm} disabled={pending} style={{ ...BTN_PRIMARY, display: 'inline-flex', alignItems: 'center', gap: '6px', opacity: pending ? 0.6 : 1 }}>
                      <Send size={13} /> {pending ? 'Confirmando…' : `Sí, confirmar (${summary.toSend})`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {error && <div style={ERROR}>{error}</div>}
    </div>
  )
}
