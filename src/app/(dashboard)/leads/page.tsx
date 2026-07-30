import { createAdminClient } from '@/lib/supabase/admin'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor } from '@/lib/auth/visibility'
import { mapAgent, type AgentRow } from '@/lib/db'
import { getLeadsListData } from '@/lib/data/leads'
import { parseLeadListFilters } from '@/lib/leads/list-filters'
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
  const agentsQ   = supabase.from('agents').select('*').eq('active', true)
  const channelsQ = supabase
    .from('acquisition_channels')
    .select('id, tenant_id, channel_type, name, slug, agent_id, active')
    .order('name')

  const [{ data: rawAgents }, { data: rawChannels }] = await Promise.all([
    tenant_id ? agentsQ.eq('tenant_id',   tenant_id) : agentsQ,
    tenant_id ? channelsQ.eq('tenant_id', tenant_id) : channelsQ,
  ])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: ChannelOption[] = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    tenantId:    r.tenant_id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
    agentId:     (r.agent_id ?? null) as string | null,
    active:      (r.active ?? true) as boolean,
  }))

  // Los canales resuelven el filtro de fuente (compuesto: tipo de canal o
  // traffic_source), así que la lista se pide después de tenerlos.
  const data = await getLeadsListData(scope, filters, channels)

  return (
    <LeadsClient
      leads={data.items}
      kanban={data.kanban}
      total={data.total}
      hotCount={data.hotCount}
      attentionTodayCount={data.attentionTodayCount}
      page={data.page}
      totalPages={data.totalPages}
      filters={filters}
      agents={(rawAgents ?? []).map(r => mapAgent(r as AgentRow))}
      channels={channels}
      viewerRole={role}
      viewerAgentId={scope.agentId}
    />
  )
}
