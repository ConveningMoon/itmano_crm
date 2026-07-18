export type LeadStatus =
  | 'new' | 'nurturing' | 'warm' | 'hot'
  | 'process_started' | 'process_completed' | 'closed' | 'lost'

export type AgentSpecialty =
  | 'hispanic' | 'military' | 'first_buyer' | 'brazilian'

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
  /** Idioma principal (ruteo automático de leads). Siempre ∈ languages. */
  language: Language
  /** Idiomas registrados que atiende — definen sus emails de cierre (058). */
  languages: Language[]
  specialty: AgentSpecialty
  avatarInitials: string
  accentColor: string
  active: boolean
  emailSignature?: string | null
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
  acquisitionChannelId: string | null
  trafficSource: string | null
  firstName: string
  lastName: string
  email: string
  phone?: string
  language: Language
  status: LeadStatus
  temperatureScore: number | null
  peakScore: number | null
  currentScore: number | null
  fitScore: number | null
  engagementScore: number | null
  manualScore: number | null
  lastEventAt: string | null
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
  actorUserId?: string | null
  author?: string            // resolved display, attached by the page
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
