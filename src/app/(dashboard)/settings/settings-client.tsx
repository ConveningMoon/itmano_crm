'use client'

import { useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import type { Agent } from '@/lib/types'
import type { TenantRole } from '@/lib/auth/tenant-context'
import type { ScoreRule } from '@/lib/data/score-rules'
import type { AiUsageSummary } from '@/lib/data/ai-usage'
import { AiUsagePanel, type AiUsageLimitView } from '@/components/dashboard/ai-usage-panel'
import type { AgentAiBreakdown } from '@/lib/data/ai-usage'
import { AiCapacityRequest } from './ai-capacity-request'
import type { TenantSubscription } from '@/lib/subscriptions'
import { ScoringSection } from './scoring-section'
import { CalibrationPanel } from './calibration-panel'
import type { FitEvidence } from '@/lib/scoring/calibration'
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
import { SubscriptionCard } from './subscription-card'
import { AccountSection } from './account-section'

// ─── Main settings client ─────────────────────────────────────────────────────

interface Props {
  tenant: { id: string; name: string; slug: string; primaryColor: string; logoUrl: string | null; description: string | null }
  agents: Agent[]
  agentAccess: Record<string, boolean>
  accessCount: number
  businessProfile: BusinessProfile
  // Sólo super_admin edita la allowlist de newsletters — el resto del equipo
  // la ve en solo lectura. Mismo criterio que canEditScoring.
  scoringRules: ScoreRule[]
  // Valores recomendados por ITMANO (reglas globales) por id de regla — para el
  // botón "Restablecer a recomendados" del scoring.
  recommendedRules: Record<string, { points: number; isActive: boolean }>
  canEditScoring: boolean
  // Sólo llega para super_admin — el panel de calibración es de ITMANO.
  fitEvidence: FitEvidence | null
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
  // Catálogo de etiquetas del tenant + cuántos leads usa cada una (116).
  leadTags: LeadTag[]
  leadTagCounts: Record<string, number>
}

export function SettingsClient({
  tenant, agents, agentAccess, accessCount, businessProfile, scoringRules, recommendedRules,
  canEditScoring, fitEvidence, canManageAgents, multiAgent, canLinkSelf, myAgentId, senderDomain, ownerAgentId, canDeleteAgents, userEmail, userRole,
  aiUsage, aiShowCosts, aiLimit, aiLimitSubtitle, aiByAgent, subscription,
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
    const params = new URLSearchParams(searchParams.toString())
    params.set('tab', next)
    window.history.pushState(null, '', `?${params.toString()}`)
  }, [searchParams])

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {fitEvidence && (
            <CalibrationPanel
              rules={scoringRules.map(r => ({
                category: r.category, dimension: r.dimension,
                matchValue: r.matchValue, points: r.points, isActive: r.isActive,
              }))}
              evidence={fitEvidence}
              tenantId={tenant.id}
            />
          )}
          <ScoringSection rules={scoringRules} recommended={recommendedRules} canEdit={canEditScoring} />
        </div>
      ),
      ia: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {userRole === 'agent' ? (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
              Estás viendo tu propia actividad de IA: tus requests y el porcentaje de tu
              parte del límite del equipo.
            </p>
          ) : userRole === 'agent_owner' && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, maxWidth: '460px' }}>
                Uso de IA de tu equipo este mes. ¿Se está quedando corto el límite?
                Solicita más capacidad y lo ampliamos.
              </p>
              <AiCapacityRequest />
            </div>
          )}
          <AiUsagePanel
            summary={aiUsage}
            showCosts={aiShowCosts}
            limit={aiLimit}
            limitSubtitle={aiLimitSubtitle}
            byAgent={aiByAgent}
          />
        </div>
      ),
      cuenta: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <SubscriptionCard subscription={subscription} canManage={canManageAgents} />
          <AccountSection
            userEmail={userEmail}
            userRole={userRole}
            canManage={canManageAgents}
            onGoToAgents={() => selectTab('agentes')}
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
