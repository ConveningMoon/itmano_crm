'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Agent } from '@/lib/types'
import type { TenantRole } from '@/lib/auth/tenant-context'
import type { AiUsageSummary } from '@/lib/data/ai-usage'
import type { AiUsageLimitView } from '@/lib/ai-usage/view'
import type { AgentAiBreakdown } from '@/lib/data/ai-usage'
import { AiUsageSection } from './ai-usage-section'
import type { TenantSubscription } from '@/lib/subscriptions'
import { BusinessProfileSection } from './business-profile-section'
import { TagsSection } from './tags-section'
import type { LeadTag } from '@/lib/leads/tags'
import type { BusinessProfile } from '@/lib/business/profile'
import { SettingsNav } from './settings-nav'
import { settingsNavForRole, resolveSettingsTab, type SettingsTab } from '@/lib/settings/nav'
import { TenantSection } from './team-profile-section'
import { AgentsSection } from './agents-section'
import { EmailSettingsSection } from './email-settings-section'
import { AgencyDescriptionCard } from './agency-description-card'
import { SubscriptionCard, type BillingOptions } from './subscription-card'
import { AccountSection } from './account-section'
import { SettingsSectionHead } from '@/components/ui/settings-row'

// ─── Main settings client ─────────────────────────────────────────────────────

interface Props {
  tenant: { id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null; description: string | null }
  agents: Agent[]
  agentAccess: Record<string, boolean>
  accessCount: number
  businessProfile: BusinessProfile
  // Configuración → Scoring, ya renderizado en el servidor. Sólo llega para
  // super_admin (la pestaña no existe para el resto); null en otro caso.
  scoringPanel: React.ReactNode
  canManageAgents: boolean
  multiAgent: boolean
  canLinkSelf: boolean
  myAgentId: string | null
  /** Dominio propio sobre el que firman los agentes; null = dominio compartido. */
  senderDomain: string | null
  ownerAgentId: string | null
  canDeleteAgents: boolean
  userEmail: string
  userRole: TenantRole
  aiUsage: AiUsageSummary
  aiShowCosts: boolean
  aiLimit: AiUsageLimitView | null
  aiLimitSubtitle?: string
  aiByAgent: AgentAiBreakdown | null
  subscription: TenantSubscription | null
  billingOptions: BillingOptions
  // Catálogo de etiquetas del tenant + cuántos leads usa cada una (116).
  leadTags: LeadTag[]
  leadTagCounts: Record<string, number>
}

export function SettingsClient({
  tenant, agents, agentAccess, accessCount, businessProfile, scoringPanel,
  canManageAgents, multiAgent, canLinkSelf, myAgentId, senderDomain, ownerAgentId, canDeleteAgents, userEmail, userRole,
  aiUsage, aiShowCosts, aiLimit, aiLimitSubtitle, aiByAgent, subscription, billingOptions,
  leadTags, leadTagCounts,
}: Props) {
  const searchParams = useSearchParams()
  // La lista depende del rol, así que un `?tab=scoring` de un enlace viejo (o
  // escrito a mano) cae a 'perfil' en vez de abrir una pestaña inexistente.
  const groups = settingsNavForRole(userRole)
  const tab = resolveSettingsTab(searchParams.get('tab'), userRole)

  // La sección vive en la URL: pushState se integra con useSearchParams, así
  // que cambiar de sección no pide datos al servidor y Atrás funciona.
  const selectTab = useCallback((next: SettingsTab) => {
    // Misma sección: no duplica entradas en el historial.
    if (next === tab) return
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    window.history.pushState(null, '', `?${params.toString()}`)
  }, [searchParams, tab])

  // El enlace "Agentes" de Cuenta cambia de sección: el botón que se pulsó
  // desaparece, así que el foco pasa al título de la sección destino.
  const pendingFocus = useRef<string | null>(null)
  useEffect(() => {
    if (pendingFocus.current && tab === 'agentes') {
      document.getElementById(pendingFocus.current)?.focus()
      pendingFocus.current = null
    }
  }, [tab])

  const content: Record<SettingsTab, React.ReactNode> = {
      perfil: <TenantSection tenant={tenant} canManage={canManageAgents} />,
      agentes: (
        <AgentsSection
          agents={agents}
          agentAccess={agentAccess}
          accessCount={accessCount}
          canManage={canManageAgents}
          multiAgent={multiAgent}
          canLinkSelf={canLinkSelf}
          tenantId={tenant.id}
          isSuper={userRole === 'super_admin'}
          myAgentId={myAgentId}
          ownerAgentId={ownerAgentId}
          canManageOwner={userRole === 'agent_owner' || userRole === 'super_admin'}
          canDeleteAgents={canDeleteAgents}
        />
      ),
      email: <EmailSettingsSection agents={agents} canManage={canManageAgents} myAgentId={myAgentId} senderDomain={senderDomain} />,
      etiquetas: <TagsSection tags={leadTags} counts={leadTagCounts} />,
      negocio: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <BusinessProfileSection profile={businessProfile} />
          {/* El texto libre va DESPUÉS del formulario y reencuadrado: no es
              otra forma de decir lo mismo, es lo que ningún campo captura.
              Sólo la agencia — cómo se presenta cada agente lo escribe él
              mismo, en su fila de la pestaña Agentes. */}
          <AgencyDescriptionCard initial={tenant.description} canManage={canManageAgents} />
        </div>
      ),
      scoring: (
        <div className="settings-stack">
          <SettingsSectionHead title="Scoring" description="Si el score distingue a los leads de este equipo y cómo se calibra." />
          {scoringPanel}
        </div>
      ),
      ia: (
        <AiUsageSection
          summary={aiUsage}
          showCosts={aiShowCosts}
          limit={aiLimit}
          limitSubtitle={aiLimitSubtitle}
          byAgent={aiByAgent}
          userRole={userRole}
        />
      ),
      cuenta: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <SettingsSectionHead title="Cuenta y acceso" description="Tu plan y cómo entras al CRM." />
          <SubscriptionCard subscription={subscription} canManage={canManageAgents} billingOptions={billingOptions} />
          <AccountSection
            userEmail={userEmail}
            userRole={userRole}
            canManage={canManageAgents}
            onGoToAgents={() => { pendingFocus.current = 'settings-agents-title'; selectTab('agentes') }}
          />
        </div>
      ),
  }

  return (
    <div className="settings-layout">
      <SettingsNav groups={groups} active={tab} onSelect={selectTab} />
      <div style={{ minWidth: 0 }}>{content[tab]}</div>
    </div>
  )
}
