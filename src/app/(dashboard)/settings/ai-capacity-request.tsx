'use client'

import { useState, useTransition } from 'react'
import { m } from 'motion/react'
import { Sparkles, CheckCircle2 } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { EASE_OUT_PREMIUM } from '@/components/motion/primitives'
import { requestAiCapacityIncrease } from '../soporte/actions'

const INPUT: React.CSSProperties = {
  width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: 'var(--text-primary)',
  outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-sans)',
}
const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500,
}

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
      <button
        type="button"
        className="btn-cta"
        onClick={() => setOpen(true)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border-accent)',
          background: 'color-mix(in srgb, var(--accent-gold) 10%, transparent)', color: 'var(--accent-gold)',
          fontSize: '12px', fontWeight: 600, letterSpacing: '0.03em', cursor: 'pointer',
        }}
      >
        <Sparkles size={14} strokeWidth={1.8} />
        Solicitar más capacidad de IA
      </button>

      <ModalShell open={open} onClose={close} maxWidth={460}>
        {sent ? (
          <m.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE_OUT_PREMIUM }}
            style={{ padding: '28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '12px' }}
          >
            <CheckCircle2 size={30} strokeWidth={1.6} style={{ color: 'var(--accent-green)' }} />
            <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>Solicitud enviada</div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55, margin: 0 }}>
              El equipo de ITMANO revisará tu uso y te contactará para ampliar la capacidad de IA de tu equipo.
            </p>
            <button
              type="button"
              onClick={close}
              style={{
                marginTop: '4px', padding: '9px 20px', borderRadius: '8px', border: 'none',
                background: 'var(--accent-gold)', color: 'var(--bg-base)', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              Listo
            </button>
          </m.div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>Solicitar más capacidad de IA</div>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.5, margin: '6px 0 0' }}>
                Cuéntanos por qué tu equipo necesita más generación con IA. Adjuntamos
                automáticamente tu plan y uso del mes para dimensionar el aumento.
              </p>
            </div>

            <div>
              <label style={LABEL} htmlFor="ai-reason">¿Por qué necesitas más capacidad?</label>
              <textarea
                id="ai-reason" name="reason" style={{ ...INPUT, resize: 'vertical' }}
                required minLength={10} maxLength={2000} rows={4}
                placeholder="Ej: estamos redactando muchos correos y secuencias con IA esta temporada de alta demanda."
              />
            </div>

            <div>
              <label style={LABEL} htmlFor="ai-estimate">Estimación de uso adicional (opcional)</label>
              <input
                id="ai-estimate" name="estimate" style={INPUT} maxLength={300}
                placeholder="Ej: ~40 borradores más por semana"
              />
            </div>

            {error && <p role="alert" style={{ fontSize: '12px', color: 'var(--accent-coral)', margin: 0 }}>{error}</p>}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                type="button" onClick={close}
                style={{ padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                type="submit" disabled={pending}
                className={pending ? undefined : 'btn-cta'}
                style={{ padding: '9px 20px', borderRadius: '8px', border: 'none', background: pending ? 'var(--accent-gold-dim)' : 'var(--accent-gold)', color: 'var(--bg-base)', fontSize: '13px', fontWeight: 600, cursor: pending ? 'wait' : 'pointer' }}
              >
                {pending ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        )}
      </ModalShell>
    </>
  )
}
