'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { Agent } from '@/lib/types'
import { DataBlock, DataHead, DataScope } from '@/components/ui/data-table'
import { InfoHint } from '@/components/ui/info-hint'
import { SettingsSectionHead } from '@/components/ui/settings-row'
import { AgentRow } from './agent-row'
import { CreateAgentForm } from './create-agent-form'

// ─── Agents section ───────────────────────────────────────────────────────────

// Avatar + nombre | idiomas | email | acceso | ⋯. Al estrecharse se ocultan
// primero el email y luego los idiomas; la tabla nunca pide scroll lateral.
const COLS    = 'minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1.6fr) 112px 32px'
const COLS_MD = 'minmax(0, 2fr) minmax(0, 1.3fr) 112px 32px'
const COLS_SM = 'minmax(0, 1fr) 96px 32px'

export function AgentsSection({
  agents, agentAccess, accessCount, canManage, multiAgent, canLinkSelf, tenantId, isSuper, myAgentId,
  ownerAgentId, canManageOwner, canDeleteAgents,
}: {
  agents: Agent[]
  agentAccess: Record<string, boolean>
  accessCount: number
  canManage: boolean
  // false en Esencial/Growth: un solo agente → sin crear/eliminar otros.
  multiAgent: boolean
  canLinkSelf: boolean
  tenantId: string
  isSuper: boolean
  myAgentId: string | null
  ownerAgentId: string | null
  canManageOwner: boolean
  canDeleteAgents: boolean
}) {
  const [creating, setCreating] = useState(false)
  const canCreate = canManage && multiAgent

  // Al cerrar el formulario su botón desaparece y el foco caería a <body>:
  // vuelve a "Crear agente" (que se monta de nuevo al terminar de crear).
  const createBtnRef = useRef<HTMLButtonElement>(null)
  const wasCreating = useRef(false)
  useEffect(() => {
    if (wasCreating.current && !creating) createBtnRef.current?.focus()
    wasCreating.current = creating
  }, [creating])

  return (
    <div>
      <SettingsSectionHead
        title="Agentes del equipo"
        titleId="settings-agents-title"
        description={`${agents.length} ${agents.length === 1 ? 'miembro' : 'miembros'} · ${accessCount} ${accessCount === 1 ? 'acceso activo' : 'accesos activos'}`}
        action={canCreate && !creating ? (
          <button type="button" ref={createBtnRef} className="btn btn-primary" onClick={() => setCreating(true)}>Crear agente</button>
        ) : undefined}
      />

      {/* Upsell: los planes de un solo agente no pueden crear/gestionar más. */}
      {canManage && !multiAgent && (
        <p className="settings-note settings-note-gold settings-inline settings-agent-upsell">
          <Sparkles size={15} aria-hidden="true" />
          Tu plan actual incluye un solo agente. Para sumar más, necesitas el plan Partner.
          <InfoHint label="Más agentes en tu equipo">
            Para agregar y gestionar más agentes de tu equipo (cada uno con su propio acceso y sus leads),
            adquiere el plan Partner. Escríbenos y lo activamos.
          </InfoHint>
        </p>
      )}

      {creating && <CreateAgentForm tenantId={isSuper ? tenantId : undefined} onDone={() => setCreating(false)} />}

      <DataScope cols={COLS} colsMd={COLS_MD} colsSm={COLS_SM}>
        <DataHead
          columns={[
            { label: 'Agente' },
            { label: 'Idiomas', hideSm: true },
            { label: 'Email', hideMd: true },
            { label: 'Acceso' },
            { label: '' },
          ]}
        />
        <DataBlock>
          {agents.map(agent => (
            <AgentRow
              key={agent.id}
              agent={agent}
              hasAccess={!!agentAccess[agent.id]}
              canManage={canManage}
              canLinkSelf={canLinkSelf}
              // Owner/super editan el perfil de todos; un 'agent' sólo el suyo.
              // Espeja requireSelfOrManager, que es quien lo hace cumplir de verdad.
              canEditSelf={canManage || agent.id === myAgentId}
              isOwner={agent.id === ownerAgentId}
              canManageOwner={canManageOwner}
              canDeleteAgents={canDeleteAgents}
            />
          ))}
        </DataBlock>
      </DataScope>
    </div>
  )
}
