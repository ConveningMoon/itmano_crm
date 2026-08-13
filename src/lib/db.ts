import type { Agent, Lead, LeadEvent, PurchaseProcess } from './types'

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface AgentRow {
  id: string
  tenant_id: string
  name: string
  email: string
  phone: string | null
  language: string
  languages?: string[] | null
  avatar_initials: string
  accent_color: string
  active: boolean
  created_at: string
  email_signature: string | null
  description?: string | null
}

export interface LeadRow {
  id: string
  tenant_id: string
  agent_id: string
  acquisition_channel_id: string | null
  traffic_source: string | null
  first_name: string
  last_name: string
  email: string
  phone: string | null
  language: string
  stage: string
  peak_score: number | null
  current_score: number | null
  quality_score: number | null
  fit_score: number | null
  engagement_score: number | null
  manual_score: number | null
  last_event_at: string | null
  lender: string | null
  notes: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface LeadEventRow {
  id: string
  lead_id: string
  tenant_id: string
  type: string
  description: string
  points: number | null
  created_at: string
  actor_user_id?: string | null
}

export interface PurchaseProcessRow {
  id: string
  lead_id: string
  tenant_id: string
  address: string
  loan_type: string
  closing_date: string | null
  notes: string | null
  completed_at: string | null
  created_at: string
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

export function mapAgent(r: AgentRow): Agent {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    email: r.email,
    phone: r.phone ?? undefined,
    language: r.language as Agent['language'],
    languages: (r.languages && r.languages.length > 0 ? r.languages : [r.language]) as Agent['languages'],
    avatarInitials: r.avatar_initials,
    accentColor: r.accent_color,
    active: r.active,
    emailSignature: r.email_signature ?? null,
    description: r.description ?? null,
  }
}

export function mapLead(r: LeadRow): Lead {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    agentId: r.agent_id,
    acquisitionChannelId: r.acquisition_channel_id,
    trafficSource: r.traffic_source ?? null,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone ?? undefined,
    language: r.language as Lead['language'],
    stage: r.stage as Lead['stage'],
    currentScore: r.current_score ?? null,
    qualityScore: r.quality_score ?? null,
    fitScore: r.fit_score ?? null,
    engagementScore: r.engagement_score ?? null,
    manualScore: r.manual_score ?? null,
    lastEventAt: r.last_event_at ?? null,
    lender: r.lender ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function mapPurchaseProcess(r: PurchaseProcessRow): PurchaseProcess {
  return {
    id: r.id,
    leadId: r.lead_id,
    tenantId: r.tenant_id,
    address: r.address,
    loanType: r.loan_type,
    closingDate: r.closing_date ?? undefined,
    notes: r.notes ?? undefined,
    completedAt: r.completed_at ?? null,
    createdAt: r.created_at,
  }
}

export function mapLeadEvent(r: LeadEventRow): LeadEvent {
  return {
    id:          r.id,
    tenantId:    r.tenant_id,
    leadId:      r.lead_id,
    type:        r.type,
    description: r.description,
    points:      r.points,
    createdAt:   r.created_at,
    actorUserId: r.actor_user_id ?? null,
  }
}
