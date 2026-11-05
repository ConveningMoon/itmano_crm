'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import { updateTenantDescription } from './actions'
import { SettingsCard } from '@/components/ui/settings-row'

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
    <SettingsCard
      title="Lo que el formulario no captura"
      hint={(
        <>
          Los rangos, las zonas y la comisión ya están arriba: la IA los usa como números exactos.
          Aquí va el matiz que ningún campo recoge — a quién atiendes, qué objeciones te encuentras,
          qué inventario te sobra o te falta, en qué tono hablas.
        </>
      )}
    >
      <div className="settings-stack settings-stack-tight">
        <textarea
          id="agency-description"
          className="settings-input settings-input-wide"
          value={value}
          onChange={e => { setValue(e.target.value); setError(null) }}
          disabled={!canManage}
          rows={6}
          maxLength={4000}
          aria-label="Lo que el formulario no captura"
          placeholder={'Ej.: Muchas familias militares con VA Loan y traslados por PCS, así que la urgencia manda sobre el presupuesto. Nos falta inventario de 3 dormitorios bajo el rango medio. Atendemos en inglés y español; tono cercano y educativo.'}
        />
        {error && (
          <p className="settings-alert" role="alert">
            <AlertCircle size={13} aria-hidden="true" /> {error}
          </p>
        )}
        {canManage && (
          <div className="settings-inline">
            <button type="button" className="btn btn-primary" onClick={handleSave} disabled={pending || !dirty}>
              {pending ? 'Guardando…' : 'Guardar descripción'}
            </button>
            {ok && (
              <span className="settings-success" role="status">
                <Check size={13} aria-hidden="true" /> Guardada
              </span>
            )}
          </div>
        )}
      </div>
    </SettingsCard>
  )
}
