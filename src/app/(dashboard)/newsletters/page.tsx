import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { columns } from '@/lib/supabase/columns'
import { getEditionsForTenant } from '@/lib/data/newsletters'
import { getNewsletterStats, SIN_DATOS } from '@/lib/data/newsletter-stats'
import { ensureNewsletterChannel, ensureNewsletterSequence } from '@/lib/newsletters/channel'
import { canUseNewsletters } from '@/lib/access/newsletters'
import { getSubscription } from '@/lib/data/subscriptions'
import { getTenantRow } from '@/lib/data/tenants'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { EditionsList } from './editions-list'

// Pantalla única de la newsletter del tenant — ya no hay series que elegir
// antes: el canal implícito se prepara aquí, ANTES de leer nada, para que
// exista desde la primera visita y el formulario público responda sin que el
// usuario haya hecho nada.

// Los pasos se resuelven por el TIPO de canal, no por el id de la secuencia:
// así viajan en la misma ola que todo lo demás en vez de esperar a que
// ensureNewsletterChannel devuelva su id. Si el canal (o la secuencia) se crea
// en esta misma visita, no hay pasos todavía y el resultado vacío es correcto.
const SEQUENCE_STEP_SELECT = `${columns('email_sequence_steps', ['id'])}, email_sequences!inner(id, acquisition_channels!inner(channel_type, archived_at))`

export default async function NewslettersPage() {
  const ctx = await requireTenantContext()
  const { tenant_id, role, user_id } = ctx
  const db = createAdminClient()

  // super_admin en modo hub (sin tenant seleccionado) no tiene subscripción
  // que leer — canUseNewsletters ya lo deja pasar siempre por rol, así que el
  // plan por defecto aquí nunca lo bloquea a él, solo a un tenant real.
  //
  // getSubscription es la misma lectura cacheada que hace el shell, pero
  // esperarla ANTES de lanzar las lecturas de la página las dejaba en una ola
  // posterior a la del shell. Van todas juntas y el plan se comprueba después:
  // si no alcanza, lo leído (todo acotado al tenant) se descarta.
  const [subscription, canal, editions, stats, tenantRow, { data: stepRows }] = await Promise.all([
    tenant_id ? getSubscription(tenant_id) : Promise.resolve(null),
    tenant_id ? ensureNewsletterChannel(db, tenant_id) : Promise.resolve({ error: 'sin tenant' } as const),
    tenant_id ? getEditionsForTenant(tenant_id) : Promise.resolve([]),
    tenant_id ? getNewsletterStats(tenant_id) : Promise.resolve(null),
    // Misma fila (y mismo round-trip) que el shell: ver getTenantRow.
    tenant_id ? getTenantRow(tenant_id) : Promise.resolve(null),
    tenant_id
      ? db.from('email_sequence_steps').select(SEQUENCE_STEP_SELECT)
          .eq('tenant_id', tenant_id)
          .eq('email_sequences.acquisition_channels.channel_type', 'newsletter')
          .is('email_sequences.acquisition_channels.archived_at', null)
      : Promise.resolve({ data: null }),
  ])
  const plan: SubscriptionPlan = subscription?.plan ?? 'esencial'

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

  // El canal implícito ya se preparó arriba, en la misma ola que las lecturas,
  // igual que el conteo de pasos. La secuencia sólo se crea aquí si el canal no
  // la tiene todavía: en ese caso nace vacía y el aviso de abajo es correcto.
  const sequenceId = 'error' in canal
    ? null
    : (canal.sequenceId ?? await ensureNewsletterSequence(db, tenant_id, canal.id))

  // reason: el cliente de Supabase no está tipado en este repo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantSlug = ((tenantRow as any)?.slug as string | undefined) ?? ''
  const sequenceEmpty = sequenceId !== null && (stepRows?.length ?? 0) === 0

  return (
    <EditionsList
      editions={editions}
      stats={{ totals: (stats ?? SIN_DATOS).totals, byEdition: Object.fromEntries((stats ?? SIN_DATOS).byEdition) }}
      tenantSlug={tenantSlug}
      sequenceId={sequenceId}
      sequenceEmpty={sequenceEmpty}
      myUserId={user_id}
      isAgent={role === 'agent'}
    />
  )
}
