import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getAiUsageSummary, getAgentAiBreakdown } from '@/lib/data/ai-usage'
import { maskAiCosts } from '@/lib/ai-usage/view'
import { getAiLimitIndicatorFor } from '@/lib/services/ai-limit'
import { getSubscription } from '@/lib/data/subscriptions'
import { getTenantRow } from '@/lib/data/tenants'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { PLANS } from '@/lib/plans'
import { getBusinessProfile } from '@/lib/data/business-profile'
import { EMPTY_PROFILE } from '@/lib/business/profile'
import { countLeadsByTag, listLeadTags } from '@/lib/data/lead-tags'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import { resolveSenderIdentity, usesSharedDomain } from '@/lib/services/sender-identity'
import { domainOf } from '@/lib/email/sender-address'
import { redactPeerAgents } from '@/lib/settings/agents-view'
import { SettingsClient } from './settings-client'
import { freshOnNavigation } from '@/components/layout/fresh-page'
import { PageHeader } from '@/components/ui/page-header'
import { DEFAULT_TENANT_COLOR } from '@/lib/config'
import { SettingsBodySkeleton } from './settings-skeleton'
import { TenantScoringPanel, TenantScoringSkeleton } from './tenant-scoring-panel'
import { pageMetadata } from '@/lib/routing/page-titles'

export const metadata = pageMetadata('/settings')

// Todo lo que lee la sesión o la base vive aquí, detrás del Suspense de
// SettingsPage: la cabecera y el esqueleto salen del shell estático.
async function SettingsContent() {
  const ctx      = await requireTenantContext()
  const supabase = createAdminClient()

  // Settings es "la configuración de este tenant": owner/agent → su tenant;
  // super_admin → el tenant seleccionado (requireTenantContext garantiza que
  // hay selección — sin ella, redirige al centro de control).
  const tenantId = ctx.tenant_id
  if (!tenantId) redirect('/admin')

  // Uso de IA según el rol: un 'agent' ve SOLO su propia actividad (requests
  // suyos + el porcentaje de SU parte del límite en Partner); owner/super ven
  // el resumen del equipo con desglose por agente.
  const isAgentViewer = ctx.role === 'agent'

  // Identidad (id + email) sale del contexto: ya validó el JWT, así que pedirle
  // el usuario otra vez al servidor de auth solo sumaba una ida y vuelta.

  // "Tu negocio" es del equipo, no del agente: sólo owner/super la ven. Para el
  // rol 'agent' ni se consulta — así no viaja en el payload RSC de una pestaña
  // que no existe para él.
  const canSeeBusiness = ctx.role !== 'agent'

  // El catálogo de etiquetas sólo lo administra owner/super: para el rol 'agent'
  // la pestaña no existe, así que tampoco se paga la consulta ni viaja en el
  // payload RSC (mismo criterio que canSeeBusiness).
  const canManageTags = ctx.role !== 'agent'

  // Una sola ola. La lista de owners va aquí y no en un await suelto más abajo,
  // que era una ola entera más por su cuenta. El scoring (sólo super_admin) va
  // aparte, en su propio <Suspense>: no retrasa el resto de Configuración.
  const [tenantRow, { data: rawAgents }, businessProfile, { data: ownerProfiles }, accessCountRes, aiUsageRaw, aiLimit, subscription, aiByAgentRaw, leadTags, leadTagCounts, tenantAccess] = await Promise.all([
    // Misma fila (y mismo round-trip) que el shell: ver getTenantRow.
    getTenantRow(tenantId),
    supabase.from('agents').select('*').eq('tenant_id', tenantId).eq('active', true).order('name'),
    canSeeBusiness ? getBusinessProfile(tenantId) : Promise.resolve(EMPTY_PROFILE),
    // Qué agente es el owner del tenant (agents.user_id ↔ user_profiles agent_owner).
    supabase.from('user_profiles').select('id').eq('tenant_id', tenantId).eq('role', 'agent_owner'),
    // Honest "active accesses" = every login profile in this tenant (owner + any
    // login-capable agents). Replaces the hardcoded "1 acceso de sesión activo".
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    getAiUsageSummary(tenantId, isAgentViewer && ctx.agent_id ? { agentId: ctx.agent_id } : undefined),
    getAiLimitIndicatorFor(ctx),
    getSubscription(tenantId),
    isAgentViewer ? Promise.resolve(null) : getAgentAiBreakdown(tenantId),
    canManageTags ? listLeadTags(tenantId)    : Promise.resolve([]),
    canManageTags ? countLeadsByTag(tenantId) : Promise.resolve({}),
    getTenantAccessFor(tenantId),
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cliente sin tipar; columns() ya validó la lista contra el esquema
  const tenantRowAny = tenantRow as any
  const tenant = tenantRowAny
    ? { id: tenantRowAny.id as string, name: tenantRowAny.name as string, slug: tenantRowAny.slug as string, primaryColor: (tenantRowAny.primary_color as string) ?? DEFAULT_TENANT_COLOR, logoUrl: (tenantRowAny.logo_url as string | null) ?? null, description: canSeeBusiness ? ((tenantRowAny.description as string | null) ?? null) : null }
    : { id: tenantId, name: '', slug: '', primaryColor: DEFAULT_TENANT_COLOR, logoUrl: null, description: null }

  // Un 'agent' no administra al equipo: de sus compañeros sólo viaja lo público
  // (email, teléfono, firma, etc. se vacían antes de cruzar al cliente).
  const agents = redactPeerAgents(
    (rawAgents ?? []).map(r => mapAgent(r as AgentRow)),
    ctx.agent_id,
    ctx.role !== 'agent',
  )

  // Dominio sobre el que firma cada agente (senderFromForAgent). null = el
  // equipo sale por el dominio compartido de ITMANO y la dirección por agente
  // no aplica todavía.
  const senderIdentity = tenantRowAny
    ? resolveSenderIdentity(tenantRowAny, { customDomainAllowed: tenantAccess.customDomainAllowed })
    : null
  const senderDomain = senderIdentity && !usesSharedDomain(senderIdentity) ? domainOf(senderIdentity.from) : null


  // Access status per agent (user_id present) — kept off the global Agent type.
  const agentAccess: Record<string, boolean> = {}
  let ownerLinked = false
  const myUserId = ctx.user_id
  for (const r of rawAgents ?? []) {
    const row = r as AgentRow & { user_id: string | null }
    agentAccess[row.id] = !!row.user_id
    if (myUserId && row.user_id === myUserId) ownerLinked = true
  }

  const ownerUserIds = new Set(((ownerProfiles ?? []) as { id: string }[]).map(p => p.id))
  let ownerAgentId: string | null = null
  for (const r of rawAgents ?? []) {
    const row = r as AgentRow & { user_id: string | null }
    if (row.user_id && ownerUserIds.has(row.user_id)) { ownerAgentId = row.id; break }
  }
  // Plan con multi-agente (logins de equipo): solo Partner. Esencial/Growth son
  // de un solo agente → se deshabilita crear/gestionar otros agentes y se ofrece
  // el upsell a Partner. super_admin siempre puede (opera cualquier tenant).
  const multiAgent = ctx.role === 'super_admin' || (subscription ? PLANS[subscription.plan].features.multiLogin : false)
  // Eliminar agentes: plan Partner (multiLogin) o super_admin.
  const canDeleteAgents =
    ctx.role === 'super_admin' ||
    (ctx.role === 'agent_owner' && subscription?.plan === 'partner')
  // The owner may link their own login to one unlinked agent (once).
  const canLinkSelf = ctx.role === 'agent_owner' && !ownerLinked

  // Los montos en USD del uso de IA son información interna de ITMANO. Para
  // usuarios del tenant se ceroan ANTES de cruzar al cliente (no basta con
  // ocultarlos en la UI — no deben viajar en el payload RSC).
  const showAiCosts = ctx.role === 'super_admin'
  const { summary: aiUsage, byAgent: aiByAgent } = maskAiCosts(aiUsageRaw, aiByAgentRaw, showAiCosts)

  return (
    <SettingsClient
        tenant={tenant}
        agents={agents}
        agentAccess={agentAccess}
        accessCount={accessCountRes.count ?? 0}
        businessProfile={businessProfile}
        // Scoring: sólo ITMANO (super_admin). Se pasa ya renderizado, con su
        // propio Suspense, para que sus lecturas no frenen el resto.
        scoringPanel={ctx.role === 'super_admin' ? (
          <Suspense fallback={<TenantScoringSkeleton />}>
            <TenantScoringPanel tenantId={tenantId} />
          </Suspense>
        ) : null}
        canManageAgents={ctx.role !== 'agent'}
        multiAgent={multiAgent}
        canLinkSelf={canLinkSelf}
        myAgentId={ctx.agent_id}
        senderDomain={senderDomain}
        ownerAgentId={ownerAgentId}
        canDeleteAgents={canDeleteAgents}
        userEmail={ctx.email}
        userRole={ctx.role}
        aiUsage={aiUsage}
        aiShowCosts={showAiCosts}
        aiLimit={aiLimit}
        aiLimitSubtitle={aiLimit?.perAgent ? 'de tu parte del límite del equipo' : undefined}
        aiByAgent={aiByAgent}
        subscription={subscription}
        leadTags={leadTags}
        leadTagCounts={leadTagCounts}
    />
  )
}

function SettingsPage() {
  return (
    <>
      <PageHeader title="Configuración" description="Ajustes del equipo, el negocio y la cuenta." />
      <Suspense fallback={<SettingsBodySkeleton />}>
        <SettingsContent />
      </Suspense>
    </>
  )
}

export default freshOnNavigation(SettingsPage)
