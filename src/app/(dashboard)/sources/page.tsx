import { createAdminClient } from '@/lib/supabase/admin'
import { getChannelsWithMetrics, getArchivedChannelsWithMetrics } from '@/lib/data/channels'
import { getTenantRow } from '@/lib/data/tenants'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { SourcesClient, SourcesActions } from './sources-client'
import { PageHeader } from '@/components/ui/page-header'
import { StatCard } from '@/components/ui/stat-card'
import { getSourcesHealth } from '@/lib/data/source-health'
import { listFolders } from '@/lib/data/folders'
import { columns } from '@/lib/supabase/columns'
import { GitBranch, Users, Eye, TrendingUp } from 'lucide-react'
import { freshOnNavigation } from '@/components/layout/fresh-page'

async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>
}) {
  const ctx = await requireTenantContext()
  const { tenant_id, role } = ctx
  const isSuperAdmin = role === 'super_admin'
  const scope = scopeFor(ctx)
  const { window: windowParam } = await searchParams
  const windowDays = Number(windowParam ?? 30)
  const validWindow = [7, 30, 90].includes(windowDays) ? windowDays : 30

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
  const [channels, archivedChannels, health, folders, tenantPickerResult, tenantPagesResult, agentResult] = await Promise.all([
    // Agent sees only their own channels (excludes "Toda la agencia"); owner/super: tenant scope.
    getChannelsWithMetrics(tenant_id, validWindow, scope.agentId),
    getArchivedChannelsWithMetrics(tenant_id, validWindow, scope.agentId),
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

  const totalLeads     = channels.reduce((s, c) => s + c.metrics.leadsInWindow, 0)
  const totalViews     = channels.reduce((s, c) => s + c.metrics.pageViewsInWindow, 0)
  const avgConversion  = totalViews > 0 ? Math.round((totalLeads / totalViews) * 100) : 0

  return (
    <>
      <PageHeader
        title="Fuentes de adquisición"
        description={`Canales activos · últimos ${validWindow} días`}
        actions={
          <SourcesActions
            isSuperAdmin={needsTenantPicker}
            tenants={tenants}
            agents={agents}
            myAgentId={scope.agentId}
          />
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" style={{ marginBottom: '28px' }}>
        <StatCard label="Leads generados"   value={totalLeads}    icon={<Users size={16} />}      tone="var(--accent-blue)" />
        <StatCard label="Vistas totales"    value={totalViews}    icon={<Eye size={16} />}        tone="var(--accent-teal)" />
        <StatCard label="Conversión global" value={avgConversion} suffix="%" icon={<TrendingUp size={16} />} tone="var(--accent-green)" />
        <StatCard label="Fuentes activas"   value={channels.filter(c => c.active).length} icon={<GitBranch size={16} />} tone="var(--accent-gold)" />
      </div>

      {/* Client: tabs + window selector + rows */}
      <SourcesClient
        health={health}
        channels={channels}
        archivedChannels={archivedChannels}
        windowDays={validWindow}
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
