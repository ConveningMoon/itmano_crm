import { notFound, redirect } from 'next/navigation'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { getSeriesById, getEditionsForSeries } from '@/lib/data/newsletters'
import { listSequences } from '@/lib/data/email-sequences'
import { canUseNewsletters } from '@/lib/access/newsletters'
import type { SubscriptionPlan } from '@/lib/subscriptions'
import { SeriesDetail } from './series-detail'

// Detalle de una serie: sus ediciones y la gestión de la propia serie.
//
// Esta ruta existe porque no había NINGÚN camino desde el CRM hasta una edición
// ya creada: /newsletters listaba las series y /newsletters/[id] abría una
// edición, pero nada enlazaba lo uno con lo otro. El contador "N ediciones" de
// la tarjeta era el único rastro de que existían.
//
// Va bajo `serie/` y no bajo `/newsletters/[id]` porque ese segmento dinámico
// ya es la edición. Mismo recurso que /newsletters/nueva: un segmento estático
// gana sobre el dinámico hermano.

const TENANT_COLUMNS       = columns('tenants', ['slug'])
const SUBSCRIPTION_COLUMNS = columns('subscriptions', ['plan'])
const AGENT_COLUMNS        = columns('agents', ['id', 'name'])

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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

  // getSeriesById mira vivas Y archivadas a propósito: el botón de eliminar
  // definitivamente vive en esta pantalla, y sólo se llega a él cuando la serie
  // ya está archivada.
  const series = await getSeriesById(id, tenantId)
  if (!series) notFound()

  const [editions, sequences, { data: agentRows }, { data: tenantRow }] = await Promise.all([
    getEditionsForSeries(series.id, tenantId),
    listSequences(tenantId),
    db.from('agents').select(AGENT_COLUMNS).eq('tenant_id', tenantId).eq('active', true).order('name'),
    db.from('tenants').select(TENANT_COLUMNS).eq('id', tenantId).maybeSingle(),
  ])
  // reason: ver arriba.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents = ((agentRows ?? []) as any[]).map(a => ({ id: a.id as string, name: a.name as string }))
  // reason: ver arriba.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenantSlug = ((tenantRow as any)?.slug as string | undefined) ?? ''

  // Un `agent` sólo administra lo suyo. La lectura queda abierta al tenant
  // —mismo criterio que el editor de edición—, se restringe la ESCRITURA.
  const canManageSeries = ctx.role !== 'agent' || series.agentId === ctx.agent_id

  return (
    <SeriesDetail
      series={series}
      editions={editions}
      sequences={sequences}
      agents={agents}
      tenantSlug={tenantSlug}
      canManageSeries={canManageSeries}
      myUserId={ctx.user_id}
      isAgent={ctx.role === 'agent'}
    />
  )
}
