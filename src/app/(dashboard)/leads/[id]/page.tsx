import { createAdminClient } from '@/lib/supabase/admin'
import {
  mapAgent,
  mapLead,
  mapLeadEvent,
  mapPurchaseProcess,
  type AgentRow,
  type LeadRow,
  type LeadEventRow,
  type PurchaseProcessRow,
} from '@/lib/db'
import { LeadDetailClient } from './lead-detail-client'
import { notFound } from 'next/navigation'
import type { PurchaseProcess } from '@/lib/types'
import type { ChannelOption } from '../new/page'
import { getCurrentTenantContext } from '@/lib/auth/tenant-context'
import { getSubmissionsForLead } from '@/lib/data/form-submissions'
import { getLeadStatusHistory } from '@/lib/data/lead-status-history'
import { getGlobalScoreRules } from '@/lib/data/score-rules'
import type { ManualActionItem } from './manual-actions-panel'

const TENANT_ID = 'tenant-aj'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { tenant_id } = await getCurrentTenantContext()
  const supabase = createAdminClient()

  const [
    { data: rawLead },
    { data: rawAgents },
    { data: rawEvents },
    { data: rawProcess },
    { data: rawChannels },
    { data: rawActiveRuns },
    submissions,
    scoreRules,
    statusHistory,
  ] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
    supabase.from('agents').select('*'),
    supabase.from('lead_events').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('purchase_processes').select('*').eq('lead_id', id).maybeSingle(),
    supabase.from('acquisition_channels').select('id, channel_type, name, slug').eq('tenant_id', TENANT_ID).eq('active', true).order('name'),
    supabase.from('lead_sequence_runs').select('id').eq('lead_id', id).eq('status', 'active').limit(1),
    getSubmissionsForLead(id, tenant_id),
    getGlobalScoreRules(),
    getLeadStatusHistory(id, tenant_id),
  ])

  if (!rawLead) notFound()

  // Manual agent actions = active manual scoring rules (driven by Settings → Scoring).
  const manualActions: ManualActionItem[] = scoreRules
    .filter(r => r.category === 'manual' && r.isActive)
    .sort((a, b) => b.points - a.points)
    .map(r => ({
      dimension:    r.dimension,
      label:        r.label ?? r.dimension,
      points:       r.points,
      isDisqualify: r.sideEffect === 'force_perdido',
    }))

  const lead           = mapLead(rawLead as LeadRow)
  const agents         = (rawAgents  ?? []).map(r => mapAgent(r as AgentRow))
  const events         = (rawEvents  ?? []).map(r => mapLeadEvent(r as LeadEventRow))
  const purchaseProcess: PurchaseProcess | null = rawProcess ? mapPurchaseProcess(rawProcess as PurchaseProcessRow) : null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: ChannelOption[] = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
  }))
  const hasActiveSequenceRun = (rawActiveRuns ?? []).length > 0

  return (
    <LeadDetailClient
      lead={lead}
      agent={agents.find(a => a.id === lead.agentId)}
      agents={agents}
      channels={channels}
      purchaseProcess={purchaseProcess}
      events={events}
      submissions={submissions}
      hasActiveSequenceRun={hasActiveSequenceRun}
      manualActions={manualActions}
      statusHistory={statusHistory}
    />
  )
}
