import { createAdminClient } from '@/lib/supabase/admin'
import { getChannelsWithMetrics, getArchivedChannelsWithMetrics } from '@/lib/data/channels'
import { getTenantRow } from '@/lib/data/tenants'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { SourcesClient, SourcesActions } from './sources-client'
import { PageHeader } from '@/components/ui/page-header'
import { getSourcesHealth } from '@/lib/data/source-health'
import { listFolders } from '@/lib/data/folders'
import { columns } from '@/lib/supabase/columns'
import Link from 'next/link'
import { BarChart3 } from 'lucide-react'
import { getBusinessProfile } from '@/lib/data/business-profile'
import { getChannelLeadsTrend } from '@/lib/data/channels'
import { businessTimeZone } from '@/lib/time-zones'
import { freshOnNavigation } from '@/components/layout/fresh-page'

// Leads y conversión de la lista van fijos a 4 semanas, como el valor por defecto
// del Dashboard. El selector de días se fue: elegir otra ventana es de la
// pestaña Fuentes del Dashboard, no de esta lista de gestión.
const WINDOW_DAYS = 28

async function tendencias(tenantId: string) {
  const profile = await getBusinessProfile(tenantId)
  const timeZone = (profile && businessTimeZone(profile)) ?? 'UTC'
  return getChannelLeadsTrend(tenantId, WINDOW_DAYS, timeZone)
}

async function SourcesPage() {
  const ctx = await requireTenantContext()
  const { tenant_id, role } = ctx
  const isSuperAdmin = role === 'super_admin'
  const scope = scopeFor(ctx)

  const supabase = createAdminClient()

  // Picker de tenant en los modales: solo super_admin SIN selección (hoy
  // inalcanzable aquí por requireTenantContext; actuando como tenant, las
  // actions resuelven el tenant desde el contexto).
  const needsTenantPicker = isSuperAdmin && !tenant_id

  // Active agents for the owner selector, scoped al tenant del contexto
  // (incluye al super_admin actuando como tenant).
  let agentsQ = supabase
    .from('agents')
    .select(columns('agents', ['id', 'name', 'tenant_id']))
    .eq('active', true)
    .order('name')
  if (tenant_id) agentsQ = agentsQ.eq('tenant_id', tenant_id)
  // Un agente sólo crea fuentes suyas, así que el resto del equipo no tiene por
  // qué viajar en el payload de una lista que él no puede elegir.
  if (scope.agentId) agentsQ = agentsQ.eq('id', scope.agentId)

  // Ninguna de estas lecturas depende de otra. Con tenant en el contexto (el
  // caso real: requireTenantContext lo garantiza), la fila del tenant para el
  // botón "abrir página" tampoco: antes esperaba a los canales sólo para saber
  // sus tenant_ids, y eso era una ola entera más al final de cada carga.
  const [channels, archivedChannels, health, folders, tenantPickerResult, tenantPagesResult, agentResult, trendAll] = await Promise.all([
    // Agent sees only their own channels (excludes "Toda la agencia"); owner/super: tenant scope.
    getChannelsWithMetrics(tenant_id, WINDOW_DAYS, scope.agentId),
    getArchivedChannelsWithMetrics(tenant_id, WINDOW_DAYS, scope.agentId),
    // Cómo está entrando cada fuente, según lo que realmente llega.
    tenant_id ? getSourcesHealth(tenant_id) : Promise.resolve({}),
    // Carpetas de QUIEN MIRA: la organización es personal, así que dos usuarios
    // del mismo tenant ven el mismo catálogo repartido de forma distinta.
    listFolders('source', tenant_id, ctx.user_id),
    needsTenantPicker
      ? supabase.from('tenants').select(columns('tenants', ['id', 'name'])).order('name')
      : Promise.resolve({ data: [] }),
    // Misma fila (y mismo round-trip) que el shell: ver getTenantRow.
    tenant_id ? getTenantRow(tenant_id) : Promise.resolve(null),
    agentsQ,
    // La zona horaria sale de la fila del tenant (cache() de getBusinessProfile,
    // ya leída por el layout). Sin tenant en el contexto no hay tendencias que
    // pedir: las filas salen sin minigráfica.
    tenant_id ? tendencias(tenant_id) : Promise.resolve({} as Record<string, number[]>),
  ])

  // Slug y modo de gestión de cada tenant presente en las tarjetas: el botón de
  // "abrir página" arma la URL alojada con el slug, y el mensaje cuando no hay
  // página depende de si ITMANO administra a ese tenant. Sin tenant en el
  // contexto (super_admin sin selección) se resuelve por los tenants de las
  // tarjetas, que sólo se conocen después de leerlas.
  type TenantPageRow = { id: string; slug: string | null; pages_managed_by_itmano: boolean | null }
  let tenantPageRows: TenantPageRow[] = tenantPagesResult ? [tenantPagesResult] : []
  if (!tenant_id) {
    const tenantIds = [...new Set([...channels, ...archivedChannels].map(c => c.tenantId))]
    const { data } = tenantIds.length > 0
      ? await supabase
          .from('tenants')
          .select(columns('tenants', ['id', 'slug', 'pages_managed_by_itmano']))
          .in('id', tenantIds)
      : { data: null }
    tenantPageRows = (data ?? []) as unknown as TenantPageRow[]
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tenants = (tenantPickerResult.data ?? []).map((t: any) => ({ id: t.id as string, name: t.name as string }))
  const tenantPages: Record<string, { slug: string; managedByItmano: boolean }> = Object.fromEntries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenantPageRows.map((t: any) => [
      t.id as string,
      { slug: (t.slug as string) ?? '', managedByItmano: t.pages_managed_by_itmano === true },
    ]),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents = (agentResult.data ?? []).map((a: any) => ({ id: a.id as string, name: a.name as string, tenantId: a.tenant_id as string }))

  // La RPC devuelve todo el tenant; el rol agent sólo ve las fuentes que
  // getChannelsWithMetrics ya filtró, así que las demás nunca salen de aquí.
  const trends: Record<string, number[]> = {}
  for (const c of channels) trends[c.id] = trendAll[c.id] ?? []

  return (
    <>
      <PageHeader
        title="Fuentes"
        description="Cada entrada de leads: una página, un formulario o un evento."
        hint="Una fuente es por donde entran tus leads: una página, un formulario o un evento. Aquí las creas, las ordenas en carpetas y las archivas. Las métricas completas están en Dashboard → Fuentes."
        actions={
          <>
            <Link href="/dashboard?tab=fuentes" className="btn btn-ghost">
              <BarChart3 size={14} />Métricas
            </Link>
            <SourcesActions
              isSuperAdmin={needsTenantPicker}
              tenants={tenants}
              agents={agents}
              myAgentId={scope.agentId}
            />
          </>
        }
      />

      <SourcesClient
        health={health}
        channels={channels}
        archivedChannels={archivedChannels}
        trends={trends}
        isSuperAdmin={needsTenantPicker}
        tenants={tenants}
        myAgentId={scope.agentId}
        tenantPages={tenantPages}
        folders={folders}
      />
    </>
  )
}

export default freshOnNavigation(SourcesPage)
