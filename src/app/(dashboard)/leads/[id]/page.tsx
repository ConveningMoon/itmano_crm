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
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor, isRowVisible } from '@/lib/auth/visibility'
import { getSubmissionsForLead } from '@/lib/data/form-submissions'
import { getLeadStatusHistory } from '@/lib/data/lead-status-history'
import { getLeadEmailReplies } from '@/lib/data/lead-email-replies'
import { getGlobalScoreRules } from '@/lib/data/score-rules'
import { resolveActorNames, authorOf } from '@/lib/data/activity-authors'
import { buildScoreBreakdown } from '@/lib/scoring/score-breakdown'
import { resolveSenderIdentity } from '@/lib/services/sender-identity'
import type { ManualActionItem } from './manual-actions-panel'

const FROZEN_STATUSES = ['process_started', 'process_completed', 'closed', 'lost']

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ctx = await requireTenantContext()
  const { tenant_id, role, user_id } = ctx
  const scope = scopeFor(ctx)
  const supabase = createAdminClient()

  // Load the lead first and enforce visibility — an agent (or wrong-tenant viewer)
  // hitting a lead they don't own by URL gets a 404, not the record.
  const { data: rawLead } = await supabase.from('leads').select('*').eq('id', id).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!isRowVisible(scope, rawLead as any)) notFound()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leadTenantId = (rawLead as any).tenant_id as string

  // Profile activity feed: an 'agent' only sees system + their own events.
  let eventsQ = supabase.from('lead_events').select('*').eq('lead_id', id).order('created_at', { ascending: false })
  if (role === 'agent') eventsQ = eventsQ.or(`actor_user_id.is.null,actor_user_id.eq.${user_id}`)

  const [
    { data: rawAgents },
    { data: rawEvents },
    { data: rawProcess },
    { data: rawChannels },
    submissions,
    scoreRules,
    statusHistory,
    emailReplies,
  ] = await Promise.all([
    supabase.from('agents').select('*').eq('tenant_id', leadTenantId),
    eventsQ,
    supabase.from('purchase_processes').select('*').eq('lead_id', id).maybeSingle(),
    supabase.from('acquisition_channels').select('id, tenant_id, channel_type, name, slug, agent_id').eq('tenant_id', leadTenantId).eq('active', true).order('name'),
    getSubmissionsForLead(id, tenant_id),
    getGlobalScoreRules(),
    getLeadStatusHistory(id, tenant_id),
    getLeadEmailReplies(id, tenant_id),
  ])

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
  // Resolve event authors in one batch (no N+1) and attach the display label.
  const actorNames     = await resolveActorNames((rawEvents ?? []).map(r => (r as LeadEventRow).actor_user_id ?? null))
  const events         = (rawEvents  ?? []).map(r => {
    const e = mapLeadEvent(r as LeadEventRow)
    return { ...e, author: authorOf(e.actorUserId ?? null, actorNames) }
  })

  // Score breakdown (calculated view): fit dimensions matched to their rules.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lr = rawLead as any
  const scoreBreakdown = buildScoreBreakdown({
    fitProfile:      (lr.fit_profile as Record<string, unknown> | null) ?? null,
    fitScore:        (lr.fit_score as number | null) ?? 0,
    engagementScore: (lr.engagement_score as number | null) ?? 0,
    manualScore:     (lr.manual_score as number | null) ?? 0,
    currentScore:    (lr.current_score as number | null) ?? 0,
    frozen:          FROZEN_STATUSES.includes(lr.status as string),
    rules:           scoreRules,
  })
  const purchaseProcess: PurchaseProcess | null = rawProcess ? mapPurchaseProcess(rawProcess as PurchaseProcessRow) : null

  // Identidad de envío del tenant (065) — el popup de correo muestra desde qué
  // dirección sale el corporativo y avisa si el dominio propio aún no está
  // verificado (mientras tanto sale por el dominio de ITMANO).
  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('name, slug, email_from_address, resend_account, domain_status, sending_domain')
    .eq('id', leadTenantId)
    .maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tRow = tenantRow as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const identity = tRow ? resolveSenderIdentity(tRow as any) : null
  const emailSending = {
    from:          identity?.from ?? null,
    sendingDomain: (tRow?.sending_domain as string | null) ?? null,
    domainStatus:  (tRow?.domain_status as string | null) ?? 'not_configured',
    // true cuando el correo corporativo sale por el dominio compartido de ITMANO.
    usingSharedDomain: !!identity?.from?.includes('@mail.itmano.com'),
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: ChannelOption[] = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    tenantId:    r.tenant_id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
    agentId:     (r.agent_id ?? null) as string | null,
  }))
  return (
    <LeadDetailClient
      lead={lead}
      agent={agents.find(a => a.id === lead.agentId)}
      agents={agents}
      channels={channels}
      purchaseProcess={purchaseProcess}
      events={events}
      submissions={submissions}
      emailReplies={emailReplies}
      manualActions={manualActions}
      statusHistory={statusHistory}
      scoreBreakdown={scoreBreakdown}
      emailSending={emailSending}
    />
  )
}
