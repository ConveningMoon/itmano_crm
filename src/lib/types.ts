export type LeadStatus =
  | 'new' | 'nurturing' | 'warm' | 'hot'
  | 'process_started' | 'process_completed' | 'closed' | 'lost'

// Idiomas soportados (migración 062). Fuente única: LANGUAGE_CONFIG en
// src/lib/config.ts refleja exactamente este set y el CHECK de la base.
export type Language =
  | 'es' | 'en' | 'pt' | 'fr' | 'de' | 'it' | 'zh' | 'ja' | 'ko'
  | 'ru' | 'ar' | 'hi' | 'vi' | 'tl' | 'ht' | 'pl' | 'uk' | 'tr' | 'nl'

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
  avatarInitials: string
  accentColor: string
  active: boolean
  emailSignature?: string | null
  /** Descripción del agente para personalizar el análisis de fit con IA (064). */
  description?: string | null
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
  // Premura de la próxima acción según el último briefing de IA (metadata.ai_fit).
  // NO es la temperatura (esa mide qué tan bueno es el lead): mide qué tan pronto
  // conviene actuar. null cuando no hay briefing con IA.
  attentionWhen?: 'hoy' | 'esta_semana' | 'sin_apuro' | null
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
