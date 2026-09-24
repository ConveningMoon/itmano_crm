'use client'

import { useState, useTransition } from 'react'
import { respondToOpenHouse } from './actions'

const DONE: Record<string, { yes: string; no: string }> = {
  es: { yes: '¡Listo! Te esperamos.', no: 'Gracias por avisarnos.' },
  en: { yes: "You're all set. See you there!", no: 'Thanks for letting us know.' },
  pt: { yes: 'Pronto! Esperamos você.', no: 'Obrigado por avisar.' },
}

export function RsvpResponder({
  token, accent, labels, lang, initialGuests,
}: {
  token: string
  accent: string
  labels: { yes: string; no: string; guests: string; current: string | null }
  lang: string
  initialGuests: number
}) {
  const [guests, setGuests] = useState(initialGuests)
  const [done, setDone] = useState<'yes' | 'no' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const D = DONE[lang] ?? DONE.en

  function answer(response: 'yes' | 'no') {
    setError(null)
    start(async () => {
      const res = await respondToOpenHouse({ token, response, guests: response === 'yes' ? guests : 0 })
      if (!res.ok) { setError(res.error); return }
      setDone(response)
    })
  }

  if (done) {
    return <div role="status" style={{ marginTop: '22px', fontSize: '15px', fontWeight: 700 }}>{D[done]}</div>
  }

  const btn: React.CSSProperties = {
    flex: '1 1 160px', padding: '12px 16px', fontSize: '14px', fontWeight: 700, borderRadius: '12px', cursor: 'pointer',
  }

  return (
    <div style={{ marginTop: '22px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {labels.current && <div style={{ fontSize: '13px', color: 'rgba(18,33,47,0.68)' }}>{labels.current}</div>}
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'rgba(18,33,47,0.68)' }}>
        {labels.guests}
        <input
          type="number" min={0} max={10} value={guests}
          onChange={e => setGuests(Math.max(0, Math.min(10, Number(e.target.value) || 0)))}
          style={{ width: '80px', padding: '9px 11px', fontSize: '14px', borderRadius: '10px', border: '1px solid rgba(18,33,47,0.15)' }}
        />
      </label>
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        <button onClick={() => answer('yes')} disabled={pending} style={{ ...btn, border: 'none', background: accent, color: '#12212F', opacity: pending ? 0.6 : 1 }}>{labels.yes}</button>
        <button onClick={() => answer('no')} disabled={pending} style={{ ...btn, background: '#fff', border: '1px solid rgba(18,33,47,0.15)', color: '#12212F', opacity: pending ? 0.6 : 1 }}>{labels.no}</button>
      </div>
      {error && <div role="alert" style={{ fontSize: '13px', color: '#B3261E' }}>{error}</div>}
    </div>
  )
}
