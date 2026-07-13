'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, X, FileText } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { generateSequenceSteps } from '../ai-actions'

// Bootstrap de una secuencia vacía: genera los 3 correos con IA en una sola
// pasada y los inserta como pasos 0/1/2. Los inputs dependen del tipo de canal
// asociado a la secuencia:
//   - lead_magnet: PDF del material (opcional) y/o descripción — 0h · +3d · +10d
//   - event:       descripción + fecha del evento — 0h · 1 día antes · 1 día después
//   - otros:       solo descripción — 0h · +3d · +10d

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
  display: 'block',
}

export function SequenceBootstrapModal({
  open, onClose, sequenceId, channelType, channelName,
}: {
  open:        boolean
  onClose:     () => void
  sequenceId:  string
  channelType: string | null
  channelName: string | null
}) {
  const router = useRouter()
  const kind: 'lead_magnet' | 'event' | 'generic' =
    channelType === 'lead_magnet' ? 'lead_magnet'
    : channelType === 'event'     ? 'event'
    : 'generic'

  const [description, setDescription] = useState('')
  const [eventDate, setEventDate]     = useState('')
  const [fileName, setFileName]       = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError]   = useState<string | null>(null)
  const [pending, start]    = useTransition()

  const canSubmit = kind === 'lead_magnet'
    ? (!!fileName || !!description.trim())
    : kind === 'event'
      ? (!!description.trim() && !!eventDate)
      : !!description.trim()

  function handleClose() {
    setError(null)
    onClose()
  }

  function handleGenerate() {
    setError(null)
    start(async () => {
      const fd = new FormData()
      fd.set('sequenceId', sequenceId)
      fd.set('description', description)
      if (kind === 'event') fd.set('eventDate', eventDate)
      const file = fileRef.current?.files?.[0]
      if (kind === 'lead_magnet' && file) fd.set('file', file)

      const res = await generateSequenceSteps(fd)
      if (!res.ok) { setError(res.error); return }
      handleClose()
      router.refresh()
    })
  }

  const timingNote = kind === 'event'
    ? 'El 1º se envía al registrarse · el 2º un día antes del evento · el 3º un día después del evento.'
    : 'El 1º se envía al suscribirse · el 2º a los 3 días · el 3º 10 días después del segundo.'

  return (
    <ModalShell open={open} onClose={handleClose} maxWidth={560}>
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={15} color="var(--accent-gold)" />
            Crear los 3 correos con IA
          </span>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 18px', lineHeight: 1.5 }}>
          {channelName ? <>Secuencia de <strong style={{ color: 'var(--text-secondary)' }}>{channelName}</strong>. </> : null}
          {timingNote} Después puedes editar cada correo y su delay.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          {kind === 'lead_magnet' && (
            <div>
              <label style={LABEL}>PDF del lead magnet (opcional)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  onChange={e => setFileName(e.target.files?.[0]?.name ?? null)}
                  style={{ ...INPUT, padding: '7px 12px', cursor: 'pointer' }}
                />
              </div>
              {fileName && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                  <FileText size={12} /> {fileName}
                </div>
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                La IA lee el material para que los correos hablen de su contenido real. Máx. 10 MB.
              </div>
            </div>
          )}

          {kind === 'event' && (
            <div>
              <label style={LABEL}>Fecha del evento <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
              <input
                type="date"
                value={eventDate}
                onChange={e => setEventDate(e.target.value)}
                style={{ ...INPUT, colorScheme: 'dark', width: '180px' }}
              />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Se usa para programar el recordatorio de un día antes.
              </div>
            </div>
          )}

          <div>
            <label style={LABEL}>
              {kind === 'lead_magnet' ? 'Describe el contenido del lead magnet' : 'Descripción general'}{' '}
              {kind !== 'lead_magnet' && <span style={{ color: 'var(--accent-coral)' }}>*</span>}
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              maxLength={3000}
              placeholder={
                kind === 'lead_magnet'
                  ? 'De qué trata el material, a quién ayuda, qué encontrará dentro… Incluye el enlace de descarga si quieres que aparezca en el primer correo.'
                  : kind === 'event'
                    ? 'De qué trata el evento, dónde y cuándo es, qué va a pasar, por qué vale la pena ir…'
                    : 'De qué trata este canal, qué le interesa a quien se registra, qué quieres transmitirle…'
              }
              className="sm-input"
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: 'var(--status-hot)', marginBottom: '12px', padding: '6px 10px', background: 'color-mix(in srgb, var(--status-hot) 8%, transparent)', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button onClick={handleClose} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={pending || !canSubmit}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
              background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
              cursor: pending || !canSubmit ? 'not-allowed' : 'pointer',
              opacity: pending || !canSubmit ? 0.6 : 1,
            }}
          >
            <Sparkles size={13} />
            {pending ? 'Generando los 3 correos…' : 'Generar los 3 correos'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}
