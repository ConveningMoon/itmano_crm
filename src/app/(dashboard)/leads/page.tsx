import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getLeadsListData } from '@/lib/data/leads'
import { parseLeadListFilters } from '@/lib/leads/list-filters'
import { listLeadTags } from '@/lib/data/lead-tags'
import { LeadsClient } from './leads-client'
import type { ChannelOption } from './new/page'

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Búsqueda, filtros, orden y página viven en la URL: el servidor devuelve sólo
  // la página pedida (ver src/lib/data/leads.ts), no todos los leads del tenant.
  const filters = parseLeadListFilters(await searchParams)

  // requireTenantContext reads cookies → forces dynamic (non-cached) rendering
  const ctx = await requireTenantContext()
  const scope = scopeFor(ctx)
  const { tenant_id, role } = ctx
  const supabase = createAdminClient()

  // Agents + channels son datos de referencia para render/filtros → sólo por tenant.
  // Los canales incluyen los inactivos: un lead viejo puede colgar de uno y aun así
  // debe mostrar su nombre y responder al filtro de fuente.
  // Catálogo de etiquetas del tenant (116): resuelve el filtro ?tag=<slug> y da
  // nombre y color a los chips de cada fila, que sólo viajan como ids.
  const tagsPromise = listLeadTags(tenant_id)

  const agentsQ   = supabase.from('agents').select('*').eq('active', true)
  const channelsQ = supabase
    .from('acquisition_channels')
    .select('id, tenant_id, channel_type, name, slug, agent_id, active')
    .order('name')

  const refsPromise = Promise.all([
    tenant_id ? agentsQ.eq('tenant_id',   tenant_id) : agentsQ,
    tenant_id ? channelsQ.eq('tenant_id', tenant_id) : channelsQ,
    tagsPromise,
  ])

  // Los canales resuelven el filtro de fuente (compuesto: tipo de canal o
  // traffic_source) y las etiquetas el filtro por slug. Sólo con uno de esos
  // filtros activo hace falta esperarlos antes de pedir la lista; sin ellos,
  // esperar el catálogo añadía una ola entera de round-trips a cada carga.
  const needsRefs = filters.source !== 'all' || filters.tag !== 'all'
  const refs = needsRefs ? await refsPromise : null
  const [[{ data: rawAgents }, { data: rawChannels }, tags], data] = await Promise.all([
    refs ?? refsPromise,
    refs
      ? getLeadsListData(scope, filters, toChannelOptions(refs[1].data), refs[2])
      : getLeadsListData(scope, filters, [], []),
  ])

  const channels = toChannelOptions(rawChannels)

  return (
    <LeadsClient
      leads={data.items}
      kanban={data.kanban}
      total={data.total}
      highQualityCount={data.highQualityCount}
      urgentTodayCount={data.urgentTodayCount}
      page={data.page}
      totalPages={data.totalPages}
      filters={filters}
      agents={(rawAgents ?? []).map(r => mapAgent(r as AgentRow))}
      channels={channels}
      tags={tags}
      viewerRole={role}
      viewerAgentId={scope.agentId}
    />
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toChannelOptions(rawChannels: any[] | null): ChannelOption[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    tenantId:    r.tenant_id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
    agentId:     (r.agent_id ?? null) as string | null,
    active:      (r.active ?? true) as boolean,
  }))
}
