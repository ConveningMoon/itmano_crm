'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Check } from 'lucide-react'
import type { Agent } from '@/lib/types'
import { agentLocalPart } from '@/lib/email/sender-address'
import { updateAgentSignature, updateAgentSenderLocalPart } from './actions'
import { SettingsCard, SettingsSectionHead } from '@/components/ui/settings-row'
import { InfoHint } from '@/components/ui/info-hint'
import { AgentAvatar } from './agent-avatar'

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
    <div className="settings-email-row settings-email-row-col">
      <div className="settings-email-who">
        <AgentAvatar agent={agent} />
        <div className="settings-email-name">{agent.name}</div>
      </div>

      <textarea
        id={`firma-${agent.id}`}
        className="settings-input settings-input-wide"
        value={value}
        onChange={e => { setValue(e.target.value); setError(null) }}
        disabled={!canEdit}
        rows={3}
        maxLength={600}
        placeholder={`Ej.:\nUn abrazo,\n${agent.name}`}
        aria-label={`Firma de ${agent.name}`}
      />

      {error && (
        <p className="settings-alert" role="alert">
          <AlertCircle size={13} aria-hidden="true" /> {error}
        </p>
      )}

      {canEdit && (
        <div className="settings-inline">
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={pending || !dirty}>
            {pending ? 'Guardando…' : 'Guardar firma'}
          </button>
          {ok && (
            <span className="settings-success" role="status">
              <Check size={13} aria-hidden="true" /> Firma guardada
            </span>
          )}
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
    <div className="settings-email-row">
      <div className="settings-email-who">
        <AgentAvatar agent={agent} />
        <div className="settings-email-who-text">
          <div className="settings-email-name">{agent.name}</div>
          {/* La dirección efectiva se recalcula al guardar; si es larga se
              trunca, pero el título la muestra completa. */}
          <div className="settings-email-effective" title={`"${agent.name}" <${effective}>`}>
            &quot;{agent.name}&quot; &lt;{effective}&gt;
          </div>
        </div>
      </div>
      {canEdit && (
        <div className="settings-email-edit">
          <input
            id={`envio-${agent.id}`}
            className="settings-input settings-input-mono"
            value={value}
            onChange={e => { setValue(e.target.value); setError(null); setOk(false) }}
            placeholder={derived}
            maxLength={64}
            aria-label={`Dirección de envío de ${agent.name}`}
          />
          <code className="settings-email-domain" title={`@${domain}`}>@{domain}</code>
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={pending || !dirty}>
            {pending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      )}
      {error && (
        <p className="settings-alert" role="alert">
          <AlertCircle size={13} aria-hidden="true" /> {error}
        </p>
      )}
      {ok && (
        <span className="settings-success" role="status">
          <Check size={13} aria-hidden="true" /> Dirección guardada
        </span>
      )}
    </div>
  )
}

function SenderAddressCard({ agents, domain, canManage }: { agents: Agent[]; domain: string | null; canManage: boolean }) {
  return (
    <SettingsCard
      title="Dirección de envío"
      action={domain ? (
        <InfoHint label="Cómo se arma la dirección de envío">
          Los correos salen con el nombre del agente y su dirección en <strong>{domain}</strong>. Si la dejas vacía se usa la parte de su email antes de la @.
        </InfoHint>
      ) : undefined}
    >
      {!domain ? (
        <p className="settings-note">
          Tu equipo envía desde el dominio compartido de ITMANO. La dirección por agente se activa cuando el equipo envía desde su propio dominio verificado (planes Growth y Partner).
        </p>
      ) : agents.length === 0 ? (
        <p className="settings-empty">No hay agentes todavía.</p>
      ) : (
        agents.map(agent => <AgentSenderRow key={agent.id} agent={agent} domain={domain} canEdit={canManage} />)
      )}
    </SettingsCard>
  )
}

export function EmailSettingsSection({ agents, canManage, myAgentId, senderDomain }: { agents: Agent[]; canManage: boolean; myAgentId: string | null; senderDomain: string | null }) {
  // El agente sólo ve —y edita— su propia firma. Las de sus compañeros no eran
  // editables (requireSelfOrManager), pero seguían a la vista en solo lectura:
  // es texto que escribió otra persona y no aporta nada a su configuración.
  const visible = canManage ? agents : agents.filter(a => a.id === myAgentId)

  return (
    <div>
      <SettingsSectionHead title="Email" description="Desde dónde y con qué firma salen los correos a tus leads." />
      <div className="settings-stack">
        <SenderAddressCard agents={visible} domain={senderDomain} canManage={canManage} />
        <SettingsCard
          title="Firma de correo"
          action={(
            <InfoHint label="Cómo se usa la firma">
              {canManage
                ? 'La firma de cada agente se agrega automáticamente al final de todos los correos que se envían a sus leads'
                : 'Tu firma se agrega automáticamente al final de todos los correos que se envían a tus leads'}
              {' '}(secuencias, hitos de compra y envíos puntuales). Escríbela en tono personal, como cerrarías un
              correo a un conocido.
            </InfoHint>
          )}
        >
          {visible.length === 0 ? (
            <p className="settings-empty">No hay agentes todavía.</p>
          ) : (
            visible.map(agent => (
              <AgentSignatureRow
                key={agent.id}
                agent={agent}
                canEdit={canManage || agent.id === myAgentId}
              />
            ))
          )}
        </SettingsCard>
      </div>
    </div>
  )
}
