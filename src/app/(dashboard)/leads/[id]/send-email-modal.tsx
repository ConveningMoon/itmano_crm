'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check, Building2, User, AlertTriangle } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import {
  EmailComposer,
  emptyComposerValue,
  composerValueToInput,
  type ComposerValue,
} from '@/components/dashboard/email-composer'
import { sendLeadEmail } from './actions'
import type { Language } from '@/lib/types'

// Envío de un correo puntual a un lead. Un solo punto de entrada con DOS modos:
//   · Corporativo — sale del CRM por Resend, desde el dominio del equipo (o el
//     compartido de ITMANO si el propio aún no está verificado). Queda
//     registrado (email_sends → clicks/replies al scoring).
//   · Personal — abre el cliente de correo del agente (mailto) con el asunto y
//     el mensaje ya escritos. No pasa por el CRM ni se registra.
// El asunto, el mensaje y la generación con IA son los mismos para ambos.

export interface EmailSendingInfo {
  from:              string | null
  sendingDomain:     string | null
  domainStatus:      string
  usingSharedDomain: boolean
}

type Mode = 'corporate' | 'personal'

export function SendEmailModal({
  open, onClose, leadId, leadEmail, language, leadFirstName, agentName, tenantName, sending,
}: {
  open:           boolean
  onClose:        () => void
  leadId:         string
  leadEmail:      string
  language:       Language
  leadFirstName?: string
  agentName?:     string
  tenantName?:    string
  sending?:       EmailSendingInfo
}) {
  const router = useRouter()
  const [mode, setMode]         = useState<Mode>('corporate')
  const [composer, setComposer] = useState<ComposerValue>(emptyComposerValue)
  const [error, setError]   = useState<string | null>(null)
  const [done, setDone]     = useState<Mode | null>(null)
  const [pending, start]    = useTransition()

  function reset() {
    setComposer(emptyComposerValue())
    setError(null)
    setDone(null)
    setMode('corporate')
  }

  function handleClose() {
    reset()
    onClose()
  }

  function handleSend() {
    setError(null)
    const input = composerValueToInput(composer)
    if (!input.ok) { setError(input.error); return }

    // Personal: abre el cliente de correo del agente con todo prellenado.
    if (mode === 'personal') {
      const href = `mailto:${encodeURIComponent(leadEmail)}?subject=${encodeURIComponent(input.subject)}&body=${encodeURIComponent(composer.body)}`
      window.location.href = href
      setDone('personal')
      return
    }

    start(async () => {
      const res = await sendLeadEmail(leadId, { subject: input.subject, content: input.content })
      if (!res.ok) { setError(res.error); return }
      setDone('corporate')
      router.refresh()
    })
  }

  // Aviso: el corporativo sale por el dominio de ITMANO porque el propio del
  // equipo todavía no está verificado (o no se ha agregado).
  const showDomainNotice =
    mode === 'corporate' && !!sending?.usingSharedDomain && sending.domainStatus !== 'verified'

  const options: { key: Mode; icon: React.ReactNode; title: string; desc: string }[] = [
    {
      key: 'corporate',
      icon: <Building2 size={16} />,
      title: 'Corporativo',
      desc: sending?.from
        ? `Sale desde ${sending.from} y queda registrado en el CRM.`
        : 'Sale desde el dominio del equipo y queda registrado en el CRM.',
    },
    {
      key: 'personal',
      icon: <User size={16} />,
      title: 'Personal',
      desc: 'Abre tu cliente de correo con el mensaje listo. No pasa por el CRM.',
    },
  ]

  return (
    <ModalShell open={open} onClose={handleClose} maxWidth={680}>
      <div style={{ padding: '24px', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Enviar correo</span>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
        </div>

        {done ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '32px 0' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(107,163,104,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={22} color="var(--accent-green)" />
            </div>
            <span style={{ fontSize: '14px', color: 'var(--text-primary)', textAlign: 'center' }}>
              {done === 'corporate' ? 'Correo enviado.' : 'Abrimos tu cliente de correo con el mensaje listo.'}
            </span>
            <button
              onClick={handleClose}
              style={{ padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px', background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', cursor: 'pointer' }}
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            {/* Selector de modo */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '18px' }}>
              {options.map(o => {
                const active = mode === o.key
                return (
                  <button
                    key={o.key}
                    onClick={() => { setMode(o.key); setError(null) }}
                    style={{
                      textAlign: 'left', cursor: 'pointer', padding: '12px 14px', borderRadius: '10px',
                      background: active ? 'rgba(201,169,110,0.08)' : 'var(--bg-elevated)',
                      border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 600, color: active ? 'var(--accent-gold)' : 'var(--text-primary)' }}>
                      {o.icon} {o.title}
                    </span>
                    <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '5px' }}>
                      {o.desc}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Aviso de dominio no verificado (solo corporativo) */}
            {showDomainNotice && (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '9px', marginBottom: '16px',
                padding: '10px 12px', borderRadius: '8px',
                background: 'rgba(201,169,110,0.08)', border: '1px solid rgba(201,169,110,0.28)',
              }}>
                <AlertTriangle size={15} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '1px' }} />
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {sending?.sendingDomain
                    ? <>El dominio <strong style={{ color: 'var(--text-primary)' }}>{sending.sendingDomain}</strong> aún no está verificado.</>
                    : <>Tu equipo aún no tiene un dominio de envío propio configurado.</>}
                  {' '}Mientras tanto, los correos corporativos salen desde el dominio de ITMANO. Escríbenos para completar la verificación.
                </span>
              </div>
            )}

            <EmailComposer
              value={composer}
              onChange={setComposer}
              locale={language}
              ai={{ purpose: 'one_off', language, agentName, tenantName, leadFirstName }}
              previewContext={{ leadId }}
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
                {pending ? 'Enviando…' : mode === 'corporate' ? 'Enviar correo' : 'Abrir en mi correo'}
              </button>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}
