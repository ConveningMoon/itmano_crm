export type LeadStatus =
  | 'new' | 'nurturing' | 'warm' | 'hot'
  | 'process_started' | 'process_completed' | 'closed' | 'lost'

export type AgentSpecialty =
  | 'hispanic' | 'military' | 'first_buyer' | 'brazilian'

export type LeadSourceType =
  | 'lead_magnet' | 'web_form' | 'open_house' | 'manual' | 'ads' | 'referral'

export type Language = 'es' | 'en' | 'pt'

export interface Tenant {
  id: string
  name: string
  slug: string
  logoUrl?: string
  primaryColor: string
}

export interface UserProfile {
  id: string
  tenantId: string | null
  role: 'super_admin' | 'agent_owner'
}

export interface Agent {
  id: string
  tenantId: string
  name: string
  email: string
  phone?: string
  language: Language
  specialty: AgentSpecialty
  avatarInitials: string
  accentColor: string
  active: boolean
}

export interface LeadSource {
  id: string
  tenantId: string
  name: string
  type: LeadSourceType
}

export interface LeadMagnet {
  id: string
  tenantId: string
  agentId: string
  title: string
  subtitle: string
  language: Language
  monthYear: string
  pageUrl: string
  coverEmoji: string
  active: boolean
}

export interface Lead {
  id: string
  tenantId: string
  agentId: string
  sourceId: string
  firstName: string
  lastName: string
  email: string
  phone?: string
  language: Language
  status: LeadStatus
  temperatureScore: number
  lender?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface LeadEvent {
  id: string
  tenantId: string
  leadId: string
  type: string
  description: string
  points: number | null
  createdAt: string
}

export interface PurchaseProcess {
  id: string
  tenantId: string
  leadId: string
  address: string
  loanType: string
  closingDate?: string   // ISO date string "YYYY-MM-DD" from Postgres date column
  notes?: string
  createdAt: string
}

export interface NavItem {
  label: string
  href: string
  icon: string
  badge?: number
}
