'use client'

import { useState, useTransition } from 'react'
import { Sparkles } from 'lucide-react'
import { updateTenantDescription } from './actions'
import { INPUT, BTN_PRIMARY, CARD, CARD_HEADER } from './settings-styles'

// ─── Contexto para IA: descripción de agencia + por agente ───────────────────
// La IA consulta estos textos para el análisis de fit de leads y para
// personalizar el contenido (el análisis con IA se activa por ITMANO).

export function AgencyDescriptionCard({ initial, canManage }: { initial: string | null; canManage: boolean }) {
  const [value, setValue] = useState(initial ?? '')
  const [saved, setSaved] = useState(initial ?? '')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk]       = useState(false)
  const [pending, start]  = useTransition()
  const dirty = value !== saved

  function handleSave() {
    setError(null); setOk(false)
    start(async () => {
      const res = await updateTenantDescription(value)
      if (!res.ok) { setError(res.error); return }
      setSaved(value); setOk(true); setTimeout(() => setOk(false), 2000)
    })
  }

  return (
    <div style={CARD}>
      <div style={CARD_HEADER}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={15} color="var(--accent-gold)" />
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Lo que el formulario no captura</span>
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>
          Los rangos, las zonas y la comisión ya están arriba: la IA los usa como números exactos.
          Aquí va el matiz que ningún campo recoge — a quién atiendes, qué objeciones te encuentras,
          qué inventario te sobra o te falta, en qué tono hablas.
        </div>
      </div>
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <textarea
          value={value}
          onChange={e => { setValue(e.target.value); setError(null) }}
          disabled={!canManage}
          rows={6}
          maxLength={4000}
          placeholder={'Ej.: Muchas familias militares con VA Loan y traslados por PCS, así que la urgencia manda sobre el presupuesto. Nos falta inventario de 3 dormitorios bajo el rango medio. Atendemos en inglés y español; tono cercano y educativo.'}
          style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6, opacity: canManage ? 1 : 0.7 }}
        />
        {error && <div style={{ fontSize: '12px', color: '#E04040' }}>{error}</div>}
        {canManage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button onClick={handleSave} disabled={pending || !dirty} style={{ ...BTN_PRIMARY, opacity: pending || !dirty ? 0.5 : 1, cursor: pending || !dirty ? 'default' : 'pointer' }}>
              {pending ? 'Guardando…' : 'Guardar descripción'}
            </button>
            {ok && <span style={{ fontSize: '12px', color: 'var(--accent-green)' }}>Guardada.</span>}
          </div>
        )}
      </div>
    </div>
  )
}
