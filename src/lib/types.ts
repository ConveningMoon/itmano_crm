// La etapa vive en src/lib/scoring/priority.ts junto a las otras dos dimensiones
// (calidad y urgencia); aquí sólo se reexporta para no obligar a cada consumidor
// de Lead a importar de dos sitios.
export type { Stage } from './scoring/priority'

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
  /** Comisión que ESTE agente negoció. null = hereda la de la agencia. */
  commissionModel?: 'percentage' | 'flat' | null
  commissionBuy?:   number | null
  commissionSell?:  number | null
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
  /** Dónde está en el embudo. La mueve el agente, no el scoring (migración 082). */
  stage: import('./scoring/priority').Stage
  /** El score del motor. Decae con el tiempo — para "qué tan bueno es", usa quality. */
  currentScore: number | null
  /** Qué tan bueno es. Lo calcula el sistema y NO decae. */
  qualityScore: number | null
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
  /** Cuándo se completó el proceso. Null = sigue abierto (migración 082). */
  completedAt: string | null
  createdAt: string
}

export interface NavItem {
  label: string
  href: string
  icon: string
  badge?: number
}
