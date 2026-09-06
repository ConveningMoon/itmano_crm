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
import type { AiFitBriefing } from './ai-fit-card'
import { notFound } from 'next/navigation'
import type { PurchaseProcess } from '@/lib/types'
import type { ChannelOption } from '../new/page'
import { requireTenantContext } from '@/lib/auth/tenant-context'
import { scopeFor, isRowVisible } from '@/lib/auth/visibility'
import { getSubmissionsForLead } from '@/lib/data/form-submissions'
import { getLeadStatusHistory } from '@/lib/data/lead-status-history'
import { getLeadEmailReplies } from '@/lib/data/lead-email-replies'
import { getGlobalScoreRules } from '@/lib/data/score-rules'
import { getLeadPriorityPosition } from '@/lib/data/leads'
import { resolveActorNames, authorOf } from '@/lib/data/activity-authors'
import { buildScoreBreakdown } from '@/lib/scoring/score-breakdown'
import { opportunitiesFor } from '@/lib/scoring/opportunities'
import { resolveSenderIdentity } from '@/lib/services/sender-identity'
import { getTenantAccessFor } from '@/lib/subscriptions/access-server'
import { getBusinessProfile } from '@/lib/data/business-profile'
import { expectedCommission } from '@/lib/business/profile'
import type { ManualActionItem } from './manual-actions-panel'

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

  // Una sola ola para todo lo que cuelga del lead. Las lecturas del tenant y del
  // acceso de facturación entran acá también: antes iban en dos awaits sueltos al
  // final del archivo, encadenados detrás de esta ola y de la de autores, y sobre
  // una base remota cada eslabón de esa cadena se paga entero al abrir el lead.
  const [
    { data: rawAgents },
    { data: rawEvents },
    { data: rawProcess },
    { data: rawChannels },
    submissions,
    scoreRules,
    statusHistory,
    emailReplies,
    { data: tenantRow },
    tenantAccess,
    priority,
    businessProfile,
  ] = await Promise.all([
    supabase.from('agents').select('*').eq('tenant_id', leadTenantId),
    eventsQ,
    supabase.from('purchase_processes').select('*').eq('lead_id', id).maybeSingle(),
    supabase.from('acquisition_channels').select('id, tenant_id, channel_type, name, slug, agent_id').eq('tenant_id', leadTenantId).eq('active', true).order('name'),
    getSubmissionsForLead(id, tenant_id),
    getGlobalScoreRules(),
    getLeadStatusHistory(id, tenant_id),
    getLeadEmailReplies(id, tenant_id),
    // Identidad de envío + flag de análisis con IA salen de la MISMA fila de
    // `tenants`; eran dos queries separadas a la misma fila.
    supabase
      .from('tenants')
      .select('name, slug, email_from_address, resend_account, domain_status, sending_domain, ai_lead_scoring_enabled')
      .eq('id', leadTenantId)
      .maybeSingle(),
    getTenantAccessFor(leadTenantId),
    // Los tres ejes + la posicion en la cola. El ranking se resuelve con counts
    // sobre indice dentro de Postgres, nunca trayendo la cartera a memoria.
    getLeadPriorityPosition(id, scope),
    // Comisión y moneda de la agencia — sin esto el monto del lead es un número
    // sin significado para quien lo mira.
    getBusinessProfile(leadTenantId),
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
    rules:           scoreRules,
  })
  const opportunities = opportunitiesFor(lr.fit_profile as Record<string, unknown> | null)

  // Valor potencial: lo que deja la operación si cierra. El bucket de presupuesto
  // dice en qué rango cae el lead; esto dice cuánto vale — dos leads igual de
  // buenos no valen lo mismo si uno compra el doble. Es un HECHO condicional
  // ("si cierra, deja X"), no una probabilidad: no se pondera por calidad ni se
  // mezcla con el score.
  const budgetAmount = typeof lr.metadata?.budget_amount === 'number' ? lr.metadata.budget_amount as number : null
  // La comisión es una sola, la de la agencia (migración 094). Hubo una por
  // agente y se retiró: lo que cada agente negocia es su split de esta cifra, y
  // un split no cambia el orden de su propia cartera. La tarjeta dice de quién
  // es el número en vez de dejar que se lea como el neto del agente.
  const potentialValue = budgetAmount === null ? null : {
    amount:     budgetAmount,
    commission: expectedCommission(budgetAmount, businessProfile, lr.metadata?.intent === 'sell' ? 'sell' : 'buy'),
    currency:   businessProfile.currency,
  }
  const purchaseProcess: PurchaseProcess | null = rawProcess ? mapPurchaseProcess(rawProcess as PurchaseProcessRow) : null

  // Identidad de envío del tenant (065) — el popup de correo muestra desde qué
  // dirección sale el corporativo y avisa si el dominio propio aún no está
  // verificado (mientras tanto sale por el dominio de ITMANO).
  // El badge necesita el acceso de facturación (customDomainAllowed) igual que
  // los puntos de envío reales: si la suscripción está degradada (paused/cancelled),
  // el envío ya sale por el dominio compartido y el badge no puede seguir
  // mostrando el dominio propio del tenant — le mentiría al usuario justo
  // cuando más necesita saber la verdad.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tRow = tenantRow as any
  const identity = tRow
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? resolveSenderIdentity(tRow as any, { customDomainAllowed: tenantAccess.customDomainAllowed })
    : null
  const emailSending = {
    from:          identity?.from ?? null,
    sendingDomain: (tRow?.sending_domain as string | null) ?? null,
    domainStatus:  (tRow?.domain_status as string | null) ?? 'not_configured',
    // true cuando el correo corporativo sale por el dominio compartido de ITMANO.
    usingSharedDomain: !!identity?.from?.includes('@mail.itmano.com'),
  }

  // Estado del análisis de fit con IA (064) — se muestra en el detalle del lead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aiFitMeta = ((lr.metadata as any)?.ai_fit ?? null) as {
    read?: string; next_action?: string; next_action_when?: string
    talking_points?: unknown; watch_out?: string; at?: string; reasoning?: string
  } | null
  // Briefing estructurado; compat con análisis viejos que solo tenían `reasoning`.
  const rawWhen = aiFitMeta?.next_action_when
  const nextWhen: 'hoy' | 'esta_semana' | 'sin_apuro' | null =
    rawWhen === 'hoy' || rawWhen === 'esta_semana' || rawWhen === 'sin_apuro' ? rawWhen : null
  const briefing: AiFitBriefing | null = aiFitMeta && (aiFitMeta.read || aiFitMeta.next_action || aiFitMeta.reasoning)
    ? {
        read:          aiFitMeta.read ?? aiFitMeta.reasoning ?? '',
        nextAction:    aiFitMeta.next_action ?? '',
        when:          nextWhen,
        talkingPoints: Array.isArray(aiFitMeta.talking_points) ? aiFitMeta.talking_points.filter((t): t is string => typeof t === 'string') : [],
        watchOut:      aiFitMeta.watch_out ?? '',
      }
    : null
  const aiFit = {
    enabled:  (tRow?.ai_lead_scoring_enabled as boolean) ?? false,
    briefing,
    at:       aiFitMeta?.at ?? null,
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channels: ChannelOption[] = (rawChannels ?? []).map((r: any) => ({
    id:          r.id as string,
    tenantId:    r.tenant_id as string,
    channelType: r.channel_type as string,
    name:        r.name as string,
    slug:        r.slug as string,
    agentId:     (r.agent_id ?? null) as string | null,
    active:      true,  // la query ya filtra active = true
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
      opportunities={opportunities}
      priority={priority}
      potentialValue={potentialValue}
      emailSending={emailSending}
      aiFit={aiFit}
    />
  )
}
