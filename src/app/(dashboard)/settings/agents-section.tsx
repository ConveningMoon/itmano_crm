'use client'

import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import type { Agent } from '@/lib/types'
import { AgentRow } from './agent-row'
import { CreateAgentForm } from './create-agent-form'
import { BTN_PRIMARY, CARD, CARD_HEADER } from './settings-styles'

// ─── Agents section ───────────────────────────────────────────────────────────

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

  return (
    <div style={CARD}>
      <div style={{ ...CARD_HEADER, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Agentes del equipo</span>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            {agents.length} {agents.length === 1 ? 'miembro' : 'miembros'} · {accessCount} {accessCount === 1 ? 'acceso activo' : 'accesos activos'}
          </div>
        </div>
        {canCreate && !creating && (
          <button onClick={() => setCreating(true)} style={BTN_PRIMARY}>Crear agente</button>
        )}
      </div>

      {/* Upsell: los planes de un solo agente no pueden crear/gestionar más. */}
      {canManage && !multiAgent && (
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(201,169,110,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Sparkles size={16} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Tu plan actual incluye <strong style={{ color: 'var(--text-primary)' }}>un solo agente</strong>.
              Para agregar y gestionar más agentes de tu equipo (cada uno con su propio acceso y sus leads),
              adquiere el <strong style={{ color: 'var(--accent-gold)' }}>plan Partner</strong>. Escríbenos y lo activamos.
            </div>
          </div>
        </div>
      )}

      {creating && <CreateAgentForm tenantId={isSuper ? tenantId : undefined} onDone={() => setCreating(false)} />}

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
    </div>
  )
}
