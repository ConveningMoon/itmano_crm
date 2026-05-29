import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { NewSequenceForm } from './new-sequence-form'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default async function NewSequencePage() {
  const { tenant_id, role } = await getCurrentTenantContext()
  const isSuperAdmin = role === 'super_admin'

  // super_admin needs a list of tenants for the select
  let tenants: Array<{ id: string; name: string }> = []
  if (isSuperAdmin) {
    const supabase = createAdminClient()
    const { data } = await supabase
      .from('tenants')
      .select('id, name')
      .order('name')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenants = (data ?? []).map((t: any) => ({ id: t.id, name: t.name }))
  }

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
          isSuperAdmin={isSuperAdmin}
          tenants={tenants}
          fixedTenantId={tenant_id ?? undefined}
        />
      </div>
    </>
  )
}
