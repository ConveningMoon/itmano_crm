import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getSeriesForTenant } from '@/lib/data/newsletters'
import { getStudioImages } from '@/lib/data/studio'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { canGenerateWithAi } from '@/lib/newsletters/source-domains'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { NewEditionForm } from './new-edition-form'

// Creación de una edición nueva. Server Component: fetch de series + biblioteca
// del Estudio, luego el formulario (client) hace su trabajo y navega al editor
// completo en /newsletters/<id>.
//
// El botón "Generar con IA" en sí vive en series-list.tsx (el modal se abre
// desde ahí, junto a "Nueva edición"): esta página sólo enlaza de vuelta para
// quien llegó aquí a escribir a mano y en realidad quería la vía rápida.

const SUBSCRIPTION_COLUMNS = columns('subscriptions', ['plan'])
const TENANT_COLUMNS       = columns('tenants', ['newsletter_source_domains'])

export default async function NewEditionPage() {
  const ctx = await requireTenantContext()
  if (!ctx.tenant_id) redirect('/newsletters')
  const tenantId = ctx.tenant_id

  const db = createAdminClient()
  const { data: subRow } = await db
    .from('subscriptions').select(SUBSCRIPTION_COLUMNS).eq('tenant_id', tenantId).maybeSingle()
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plan = ((subRow as any)?.plan ?? 'esencial') as SubscriptionPlan
  if (!canUseNewsletters({ role: ctx.role }, plan)) redirect('/newsletters')

  const [series, studioImages, { data: tenantRow }] = await Promise.all([
    getSeriesForTenant(tenantId),
    getStudioImages(tenantId),
    db.from('tenants').select(TENANT_COLUMNS).eq('id', tenantId).maybeSingle(),
  ])
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sourceDomains = ((tenantRow as any)?.newsletter_source_domains as string[] | null) ?? []

  return (
    <div style={{ maxWidth: '560px' }}>
      {canGenerateWithAi(sourceDomains) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          padding: '10px 14px', marginBottom: '16px', borderRadius: '10px',
          border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            ¿Prefieres que la IA proponga el contenido?
          </span>
          <Link
            href="/newsletters"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', fontWeight: 500, color: 'var(--accent-gold)', textDecoration: 'none',
            }}
          >
            <Sparkles size={12} />
            Generar con IA
          </Link>
        </div>
      )}
      <NewEditionForm series={series} studioImages={studioImages} />
    </div>
  )
}
