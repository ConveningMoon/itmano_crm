import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { columns } from '@/lib/supabase/columns'
import { getEditionsForTenant } from '@/lib/data/newsletters'
import { getNewsletterStats, SIN_DATOS as ESTADISTICAS_VACIAS } from '@/lib/data/newsletter-stats'
import { ensureNewsletterChannel, ensureNewsletterSequence } from '@/lib/newsletters/channel'
import { canUseNewsletters } from '@/lib/access/newsletters'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { EditionsList } from './editions-list'

// Pantalla única de la newsletter del tenant — ya no hay series que elegir
// antes: el canal implícito se prepara aquí, ANTES de leer nada, para que
// exista desde la primera visita y el formulario público responda sin que el
// usuario haya hecho nada.

const SUBSCRIPTION_COLUMNS = columns('subscriptions', ['plan'])
const TENANT_COLUMNS = columns('tenants', ['slug'])
const SEQUENCE_STEP_COLUMNS = columns('email_sequence_steps', ['id'])

export default async function NewslettersPage() {
  const ctx = await requireTenantContext()
  const { tenant_id, role, user_id } = ctx
  const db = createAdminClient()

  // super_admin en modo hub (sin tenant seleccionado) no tiene subscripción
  // que leer — canUseNewsletters ya lo deja pasar siempre por rol, así que el
  // plan por defecto aquí nunca lo bloquea a él, solo a un tenant real.
  let plan: SubscriptionPlan = 'esencial'
  if (tenant_id) {
    const { data: subRow } = await db
      .from('subscriptions')
      .select(SUBSCRIPTION_COLUMNS)
      .eq('tenant_id', tenant_id)
      .maybeSingle()
    // reason: el cliente de Supabase no está tipado en este repo.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plan = ((subRow as any)?.plan ?? 'esencial') as SubscriptionPlan
  }

  if (!canUseNewsletters({ role }, plan)) {
    return (
      <div style={{ maxWidth: '640px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          Newsletters
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 24px' }}>
          Contenido editorial con captación de suscriptores, publicado con tu marca.
        </p>
        <div style={{
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface)',
        }}>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>
            Tu plan actual no incluye newsletters. Escríbenos y las activamos en tu cuenta.
          </p>
        </div>
      </div>
    )
  }

  if (!tenant_id) {
    return (
      <EditionsList
        editions={[]}
        stats={{ totals: { subscribers: 0, published: 0, drafts: 0, views: 0 }, byEdition: {} }}
        tenantSlug=""
        sequenceId={null}
        sequenceEmpty={false}
        myUserId={user_id}
        isAgent={role === 'agent'}
      />
    )
  }

  // Prepara la newsletter ANTES de leer: así existe desde la primera visita y
  // el formulario público responde sin que el usuario haya hecho nada.
  const canal = await ensureNewsletterChannel(db, tenant_id)
  const sequenceId = 'error' in canal
    ? null
    : (canal.sequenceId ?? await ensureNewsletterSequence(db, tenant_id, canal.id))

  // getNewsletterStats sólo lee: si el canal no se pudo resolver (`canal`
  // trae `error`), las estadísticas van en cero sin llamarla — nada que
  // agregar sin un channel_id real.
  const [editions, stats, { data: tenantRow }, { data: stepRows }] = await Promise.all([
    getEditionsForTenant(tenant_id),
    'error' in canal ? Promise.resolve(ESTADISTICAS_VACIAS) : getNewsletterStats(tenant_id, canal.id),
    db.from('tenants').select(TENANT_COLUMNS).eq('id', tenant_id).maybeSingle(),
    sequenceId
      ? db.from('email_sequence_steps').select(SEQUENCE_STEP_COLUMNS)
          .eq('tenant_id', tenant_id).eq('sequence_id', sequenceId)
      : Promise.resolve({ data: null }),
  ])
  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantSlug = ((tenantRow as any)?.slug as string | undefined) ?? ''
  const sequenceEmpty = sequenceId !== null && (stepRows?.length ?? 0) === 0

  return (
    <EditionsList
      editions={editions}
      stats={{ totals: stats.totals, byEdition: Object.fromEntries(stats.byEdition) }}
      tenantSlug={tenantSlug}
      sequenceId={sequenceId}
      sequenceEmpty={sequenceEmpty}
      myUserId={user_id}
      isAgent={role === 'agent'}
    />
  )
}
