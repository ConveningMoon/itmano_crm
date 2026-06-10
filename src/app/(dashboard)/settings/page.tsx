import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getGlobalScoreRules } from '@/lib/data/score-rules'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { SettingsClient } from './settings-client'

export default async function SettingsPage() {
  const ctx      = await getCurrentTenantContext()
  const supabase = createAdminClient()

  // Settings is "this tenant's configuration". Owner/agent → their own tenant.
  // super_admin has no tenant of their own; until admin tenant-switching exists,
  // Settings shows A&J. (Cross-tenant config lives in the /admin console.)
  const tenantId = ctx.tenant_id ?? 'tenant-aj'

  const [{ data: tenantRow }, { data: rawAgents }, scoringRules] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, primary_color').eq('id', tenantId).single(),
    supabase.from('agents').select('*').eq('tenant_id', tenantId).eq('active', true).order('name'),
    getGlobalScoreRules(),
  ])

  const tenant = tenantRow
    ? { id: tenantRow.id as string, name: tenantRow.name as string, slug: tenantRow.slug as string, primaryColor: (tenantRow.primary_color as string) ?? '#C9A96E' }
    : { id: tenantId, name: 'A&J Real Estate Group', slug: 'aj-real-estate', primaryColor: '#C9A96E' }

  const agents = (rawAgents ?? []).map(r => mapAgent(r as AgentRow))

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
        scoringRules={scoringRules}
        canEditScoring={ctx.role === 'super_admin'}
      />
    </>
  )
}
