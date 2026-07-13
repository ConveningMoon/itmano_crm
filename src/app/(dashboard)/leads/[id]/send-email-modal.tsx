'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import {
  EmailComposer,
  emptyComposerValue,
  composerValueToInput,
  type ComposerValue,
} from '@/components/dashboard/email-composer'
import { sendLeadEmail } from './actions'

// Envío de un correo puntual a un lead desde su página de detalle. Reusa el
// composer (mismo preview + generación con IA) y delega en sendLeadEmail.
export function SendEmailModal({
  open, onClose, leadId, tenantId, language, leadFirstName, agentName, tenantName,
}: {
  open:           boolean
  onClose:        () => void
  leadId:         string
  tenantId:       string
  language:       'es' | 'en' | 'pt'
  leadFirstName?: string
  agentName?:     string
  tenantName?:    string
}) {
  const router = useRouter()
  const [composer, setComposer] = useState<ComposerValue>(emptyComposerValue)
  const [error, setError]   = useState<string | null>(null)
  const [done, setDone]     = useState(false)
  const [pending, start]    = useTransition()

  function reset() {
    setComposer(emptyComposerValue())
    setError(null)
    setDone(false)
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSend() {
    setError(null)
    const input = composerValueToInput(composer)
    if (!input.ok) { setError(input.error); return }
    start(async () => {
      const res = await sendLeadEmail(leadId, { subject: input.subject, content: input.content })
      if (!res.ok) { setError(res.error); return }
      setDone(true)
      router.refresh()
    })
  }

  return (
    <ModalShell open={open} onClose={handleClose} maxWidth={680}>
      <div style={{ padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Enviar correo al lead</span>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
        </div>

        {done ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '32px 0' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(107,163,104,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={22} color="var(--accent-green)" />
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-primary)' }}>Correo enviado.</span>
            <button
              onClick={handleClose}
              style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px', background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <EmailComposer
              value={composer}
              onChange={setComposer}
              locale={language}
              previewTenantId={tenantId}
              ai={{ purpose: 'one_off', language, agentName, tenantName, leadFirstName }}
            />
            {error && (
              <div style={{ fontSize: '12px', color: 'var(--status-hot)', marginTop: '12px', padding: '8px 12px', background: 'color-mix(in srgb, var(--status-hot) 8%, transparent)', borderRadius: '6px' }}>
                {error}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
              <button onClick={handleClose} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={handleSend}
                disabled={pending}
                style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px', background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1 }}
              >
                {pending ? 'Enviando…' : 'Enviar correo'}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}
