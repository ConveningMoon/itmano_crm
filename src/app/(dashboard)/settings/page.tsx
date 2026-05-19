import { createAdminClient } from '@/lib/supabase/admin'
import { mapAgent, type AgentRow } from '@/lib/db'
import { SettingsClient } from './settings-client'

const TENANT_ID = 'tenant-aj'

export default async function SettingsPage() {
  const supabase = createAdminClient()

  const [{ data: tenantRow }, { data: rawAgents }] = await Promise.all([
    supabase.from('tenants').select('id, name, slug, primary_color').eq('id', TENANT_ID).single(),
    supabase.from('agents').select('*').eq('tenant_id', TENANT_ID).eq('active', true).order('name'),
  ])

  const tenant = tenantRow
    ? { id: tenantRow.id as string, name: tenantRow.name as string, slug: tenantRow.slug as string, primaryColor: (tenantRow.primary_color as string) ?? '#C9A96E' }
    : { id: TENANT_ID, name: 'A&J Real Estate Group', slug: 'aj-real-estate', primaryColor: '#C9A96E' }

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

      <SettingsClient tenant={tenant} agents={agents} />
    </>
  )
}
