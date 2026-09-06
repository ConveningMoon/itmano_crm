import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { NewSequenceForm } from './new-sequence-form'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function NewSequencePage() {
  const { tenant_id, role } = await requireTenantContext()
  // Picker de tenant: solo super_admin SIN selección (hoy inalcanzable aquí por
  // requireTenantContext; actuando como tenant, fixedTenantId ya viene del contexto).
  const needsTenantPicker = role === 'super_admin' && !tenant_id
  const supabase = createAdminClient()

  let tenants: Array<{ id: string; name: string }> = []
  if (needsTenantPicker) {
    const { data } = await supabase
      .from('tenants')
      .select('id, name')
      .order('name')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenants = (data ?? []).map((t: any) => ({ id: t.id, name: t.name }))
  }

  // Active agents for the organizational owner selector, scoped al tenant del
  // contexto (incluye al super_admin actuando como tenant).
  let agentsQ = supabase.from('agents').select('id, name, tenant_id').eq('active', true).order('name')
  if (tenant_id) agentsQ = agentsQ.eq('tenant_id', tenant_id)
  const { data: agentRows } = await agentsQ
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents = (agentRows ?? []).map((a: any) => ({ id: a.id as string, name: a.name as string, tenantId: a.tenant_id as string }))

  return (
    <>
      <div style={{ marginBottom: '20px' }}>
        <Link
          href="/emails"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}
        >
          <ArrowLeft size={13} />
          Secuencias de Email
        </Link>
      </div>

      <div style={{ maxWidth: '520px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Nueva Secuencia
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '28px' }}>
          Después de crearla podrás agregar los pasos y vincularla a un canal de adquisición.
        </p>

        <NewSequenceForm
          isSuperAdmin={needsTenantPicker}
          tenants={tenants}
          agents={agents}
          fixedTenantId={tenant_id ?? undefined}
        />
      </div>
    </>
  )
}
