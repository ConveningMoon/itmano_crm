import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getGlobalScoreRules } from '@/lib/data/score-rules'
import { getAiUsageSummary, type AiUsageSummary } from '@/lib/data/ai-usage'
import { getAiLimitIndicator } from '@/lib/services/ai-limit'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const ctx        = await requireTenantContext()
  const supabase   = createAdminClient()
  const authClient = await createClient()

  // Settings es "la configuración de este tenant": owner/agent → su tenant;
  // super_admin → el tenant seleccionado (requireTenantContext garantiza que
  // hay selección — sin ella, redirige al centro de control).
  const tenantId = ctx.tenant_id
  if (!tenantId) redirect('/admin')

  const [{ data: tenantRow }, { data: rawAgents }, scoringRules, accessCountRes, userRes, aiUsageRaw, aiLimit] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, primary_color, logo_url').eq('id', tenantId).single(),
    supabase.from('agents').select('*').eq('tenant_id', tenantId).eq('active', true).order('name'),
    getGlobalScoreRules(),
    // Honest "active accesses" = every login profile in this tenant (owner + any
    // login-capable agents). Replaces the hardcoded "1 acceso de sesión activo".
    supabase.from('user_profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
    authClient.auth.getUser(),
    getAiUsageSummary(tenantId),
    getAiLimitIndicator(tenantId),
  ])

  const tenant = tenantRow
    ? { id: tenantRow.id as string, name: tenantRow.name as string, slug: tenantRow.slug as string, primaryColor: (tenantRow.primary_color as string) ?? '#C9A96E', logoUrl: (tenantRow.logo_url as string | null) ?? null }
    : { id: tenantId, name: 'A&J Real Estate Group', slug: 'aj-real-estate', primaryColor: '#C9A96E', logoUrl: null }

  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))

  // Access status per agent (user_id present) — kept off the global Agent type.
  const agentAccess: Record<string, boolean> = {}
  let ownerLinked = false
  const myUserId = userRes.data.user?.id
  for (const r of rawAgents ?? []) {
    const row = r as AgentRow & { user_id: string | null }
    agentAccess[row.id] = !!row.user_id
    if (myUserId && row.user_id === myUserId) ownerLinked = true
  }
  // The owner may link their own login to one unlinked agent (once).
  const canLinkSelf = ctx.role === 'agent_owner' && !ownerLinked

  // Los montos en USD del uso de IA son información interna de ITMANO. Para
  // usuarios del tenant se ceroan ANTES de cruzar al cliente (no basta con
  // ocultarlos en la UI — no deben viajar en el payload RSC).
  const showAiCosts = ctx.role === 'super_admin'
  const zeroCost = <T extends { costUsd: number }>(x: T): T => ({ ...x, costUsd: 0 })
  const aiUsage: AiUsageSummary = showAiCosts ? aiUsageRaw : {
    allTime:   zeroCost(aiUsageRaw.allTime),
    last30d:   zeroCost(aiUsageRaw.last30d),
    byFeature: aiUsageRaw.byFeature.map(zeroCost),
    byTenant:  null,
    recent:    aiUsageRaw.recent.map(zeroCost),
  }

  return (
    <>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Configuración
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
          Perfil del equipo · Agentes · Cuenta
        </p>
      </div>

      <SettingsClient
        tenant={tenant}
        agents={agents}
        agentAccess={agentAccess}
        accessCount={accessCountRes.count ?? 0}
        scoringRules={scoringRules}
        canEditScoring={ctx.role === 'super_admin'}
        canManageAgents={ctx.role !== 'agent'}
        canLinkSelf={canLinkSelf}
        userEmail={userRes.data.user?.email ?? ''}
        userRole={ctx.role}
        aiUsage={aiUsage}
        aiShowCosts={showAiCosts}
        aiLimit={aiLimit}
      />
    </>
  )
}
