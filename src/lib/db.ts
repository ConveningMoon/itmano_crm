import type { Agent, Lead, LeadSource, LeadMagnet } from './types'

// ─── DB row shapes ────────────────────────────────────────────────────────────

export interface AgentRow {
  id: string
  tenant_id: string
  name: string
  email: string
  phone: string | null
  language: string
  specialty: string
  avatar_initials: string
  accent_color: string
  active: boolean
  created_at: string
}

export interface LeadSourceRow {
  id: string
  tenant_id: string
  name: string
  type: string
  created_at: string
}

export interface LeadRow {
  id: string
  tenant_id: string
  agent_id: string
  source_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  language: string
  status: string
  temperature_score: number
  lender: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface LeadMagnetRow {
  id: string
  tenant_id: string
  agent_id: string
  title: string
  subtitle: string
  language: string
  month_year: string
  cover_emoji: string
  page_url: string
  active: boolean
  created_at: string
  agents?: AgentRow | null
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
    specialty: r.specialty as Agent['specialty'],
    avatarInitials: r.avatar_initials,
    accentColor: r.accent_color,
    active: r.active,
  }
}

export function mapSource(r: LeadSourceRow): LeadSource {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    type: r.type as LeadSource['type'],
  }
}

export function mapLead(r: LeadRow): Lead {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    agentId: r.agent_id,
    sourceId: r.source_id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone ?? undefined,
    language: r.language as Lead['language'],
    status: r.status as Lead['status'],
    temperatureScore: r.temperature_score,
    lender: r.lender ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function mapLeadMagnet(r: LeadMagnetRow): LeadMagnet {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    agentId: r.agent_id,
    title: r.title,
    subtitle: r.subtitle,
    language: r.language as LeadMagnet['language'],
    monthYear: r.month_year,
    pageUrl: r.page_url,
    coverEmoji: r.cover_emoji,
    active: r.active,
  }
}
