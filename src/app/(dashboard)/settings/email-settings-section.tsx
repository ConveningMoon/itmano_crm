'use client'

import { useState, useTransition } from 'react'
import type { Agent } from '@/lib/types'
import { agentLocalPart } from '@/lib/email/sender-address'
import { updateAgentSignature, updateAgentSenderLocalPart } from './actions'
import { INPUT, BTN_PRIMARY, CARD, CARD_HEADER } from './settings-styles'

// ─── Email settings: firma por agente ─────────────────────────────────────────

function AgentSignatureRow({ agent, canEdit }: { agent: Agent; canEdit: boolean }) {
  const [value, setValue]   = useState(agent.emailSignature ?? '')
  const [saved, setSaved]   = useState<string>(agent.emailSignature ?? '')
  const [error, setError]   = useState<string | null>(null)
  const [ok, setOk]         = useState(false)
  const [pending, startTransition] = useTransition()

  const dirty = value !== saved

  function handleSave() {
    setError(null); setOk(false)
    startTransition(async () => {
      const res = await updateAgentSignature(agent.id, value)
      if (!res.ok) { setError(res.error); return }
      setSaved(value)
      setOk(true)
      setTimeout(() => setOk(false), 2000)
    })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: `${agent.accentColor}22`, border: `1px solid ${agent.accentColor}44`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: agent.accentColor, flexShrink: 0,
        }}>
          {agent.avatarInitials}
        </div>
        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</div>
      </div>

      <textarea
        value={value}
        onChange={e => { setValue(e.target.value); setError(null) }}
        disabled={!canEdit}
        rows={3}
        maxLength={600}
        placeholder={`Ej.:\nUn abrazo,\n${agent.name}`}
        style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, opacity: canEdit ? 1 : 0.7 }}
      />

      {error && <div style={{ fontSize: '12px', color: '#E04040' }}>{error}</div>}

      {canEdit && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button onClick={handleSave} disabled={pending || !dirty} style={{ ...BTN_PRIMARY, opacity: pending || !dirty ? 0.5 : 1, cursor: pending || !dirty ? 'default' : 'pointer' }}>
            {pending ? 'Guardando…' : 'Guardar firma'}
          </button>
          {ok && <span style={{ fontSize: '12px', color: 'var(--accent-green)' }}>Firma guardada.</span>}
        </div>
      )}
    </div>
  )
}

// ─── Email settings: dirección de envío por agente ────────────────────────────
// Cada agente firma con su nombre y una dirección sobre el dominio verificado del
// equipo (senderFromForAgent). Vacío = la parte local de su email.

function AgentSenderRow({ agent, domain, canEdit }: { agent: Agent; domain: string; canEdit: boolean }) {
  const derived = agentLocalPart({ name: agent.name, email: agent.email }) ?? ''
  const [value, setValue] = useState(agent.senderLocalPart ?? '')
  const [saved, setSaved] = useState(agent.senderLocalPart ?? '')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk]       = useState(false)
  const [pending, startTransition] = useTransition()

  const dirty = value.trim().toLowerCase() !== saved
  const effective = (saved || derived) + '@' + domain

  function handleSave() {
    setError(null); setOk(false)
    startTransition(async () => {
      const res = await updateAgentSenderLocalPart(agent.id, value)
      if (!res.ok) { setError(res.error); return }
      const next = value.trim().toLowerCase()
      setValue(next)
      setSaved(next)
      setOk(true)
      setTimeout(() => setOk(false), 2000)
    })
  }

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: '1 1 180px', minWidth: 0 }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%',
            background: `${agent.accentColor}22`, border: `1px solid ${agent.accentColor}44`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 700, color: agent.accentColor, flexShrink: 0,
          }}>
            {agent.avatarInitials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              &quot;{agent.name}&quot; &lt;{effective}&gt;
            </div>
          </div>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: '2 1 260px', minWidth: 0 }}>
            <input
              value={value}
              onChange={e => { setValue(e.target.value); setError(null); setOk(false) }}
              placeholder={derived}
              maxLength={64}
              aria-label={`Dirección de envío de ${agent.name}`}
              style={{ ...INPUT, flex: 1, minWidth: 0, fontFamily: 'monospace' }}
            />
            <code style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>@{domain}</code>
            <button onClick={handleSave} disabled={pending || !dirty} style={{ ...BTN_PRIMARY, opacity: pending || !dirty ? 0.5 : 1, cursor: pending || !dirty ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
              {pending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
      {error && <div style={{ fontSize: '12px', color: '#E04040' }}>{error}</div>}
      {ok && <div style={{ fontSize: '12px', color: 'var(--accent-green)' }}>Dirección guardada.</div>}
    </div>
  )
}

function SenderAddressCard({ agents, domain, canManage }: { agents: Agent[]; domain: string | null; canManage: boolean }) {
  return (
    <div style={CARD}>
      <div style={CARD_HEADER}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Dirección de envío</span>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
          {domain
            ? <>Los correos salen con el nombre del agente y su dirección en <strong style={{ color: 'var(--text-secondary)' }}>{domain}</strong>. Si la dejas vacía se usa la parte de su email antes de la @.</>
            : 'Tu equipo envía desde el dominio compartido de ITMANO. La dirección por agente se activa cuando el equipo envía desde su propio dominio verificado (planes Growth y Partner).'}
        </div>
      </div>
      {domain && (agents.length === 0 ? (
        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
          No hay agentes todavía.
        </div>
      ) : (
        agents.map(agent => <AgentSenderRow key={agent.id} agent={agent} domain={domain} canEdit={canManage} />)
      ))}
    </div>
  )
}

export function EmailSettingsSection({ agents, canManage, myAgentId, senderDomain }: { agents: Agent[]; canManage: boolean; myAgentId: string | null; senderDomain: string | null }) {
  // El agente sólo ve —y edita— su propia firma. Las de sus compañeros no eran
  // editables (requireSelfOrManager), pero seguían a la vista en solo lectura:
  // es texto que escribió otra persona y no aporta nada a su configuración.
  const visible = canManage ? agents : agents.filter(a => a.id === myAgentId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <SenderAddressCard agents={visible} domain={senderDomain} canManage={canManage} />
      <div style={CARD}>
        <div style={CARD_HEADER}>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Firma de correo</span>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {canManage
              ? 'La firma de cada agente se agrega automáticamente al final de todos los correos que se envían a sus leads'
              : 'Tu firma se agrega automáticamente al final de todos los correos que se envían a tus leads'}
            {' '}(secuencias, hitos de compra y envíos puntuales). Escríbela en tono personal, como cerrarías un
            correo a un conocido.
          </div>
        </div>
        {visible.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
            No hay agentes todavía.
          </div>
        ) : (
          visible.map(agent => (
            <AgentSignatureRow
              key={agent.id}
              agent={agent}
              canEdit={canManage || agent.id === myAgentId}
            />
          ))
        )}
      </div>
    </div>
  )
}
