'use client'

import { useState, useTransition } from 'react'
import { m } from 'motion/react'
import { Sparkles, CheckCircle2 } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { requestAiCapacityIncrease } from '../soporte/actions'

// Botón + modal para que el owner solicite ampliar el presupuesto de IA del
// equipo. La solicitud va a support@itmano.com (server action) con el estado
// interno del límite adjuntado — el cliente nunca ve montos en USD.
export function AiCapacityRequest() {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function close() {
    setOpen(false)
    // Reset al cerrar tras un envío exitoso, para permitir otra solicitud luego.
    setTimeout(() => { setSent(false); setError(null) }, 250)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (pending) return
    setError(null)
    const data = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await requestAiCapacityIncrease({
        reason:   String(data.get('reason') ?? ''),
        estimate: String(data.get('estimate') ?? ''),
      })
      if (res.ok) setSent(true)
      else setError(res.error)
    })
  }

  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        <Sparkles size={14} strokeWidth={1.8} />
        Solicitar más capacidad de IA
      </button>

      <ModalShell open={open} onClose={close} maxWidth={460}>
        {sent ? (
          <m.div
            className="settings-modal-done"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT_PREMIUM }}
          >
            <CheckCircle2 size={30} strokeWidth={1.6} style={{ color: 'var(--accent-green)' }} />
            <h3 className="settings-modal-title">Solicitud enviada</h3>
            <p className="settings-confirm-text">
              El equipo de ITMANO revisará tu uso y te contactará para ampliar la capacidad de IA de tu equipo.
            </p>
            <button type="button" className="btn btn-primary" onClick={close}>
              Listo
            </button>
          </m.div>
        ) : (
          <form onSubmit={handleSubmit} className="settings-modal">
            <div>
              <h3 className="settings-modal-title">Solicitar más capacidad de IA</h3>
              <p className="settings-note settings-note-gap">
                Cuéntanos por qué tu equipo necesita más generación con IA. Adjuntamos
                automáticamente tu plan y uso del mes para dimensionar el aumento.
              </p>
            </div>

            <div>
              <label className="settings-field-label" htmlFor="ai-reason">¿Por qué necesitas más capacidad?</label>
              <textarea
                id="ai-reason" name="reason" className="settings-input settings-input-wide"
                required minLength={10} maxLength={2000} rows={4}
                placeholder="Ej: estamos redactando muchos correos y secuencias con IA esta temporada de alta demanda."
              />
            </div>

            <div>
              <label className="settings-field-label" htmlFor="ai-estimate">Estimación de uso adicional (opcional)</label>
              <input
                id="ai-estimate" name="estimate" className="settings-input settings-input-wide" maxLength={300}
                placeholder="Ej: ~40 borradores más por semana"
              />
            </div>

            {error && <p role="alert" className="settings-footer-msg-error settings-confirm-text">{error}</p>}

            <div className="settings-modal-actions">
              <button type="button" className="btn btn-ghost" onClick={close}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={pending}>
                {pending ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        )}
      </ModalShell>
    </>
  )
}
