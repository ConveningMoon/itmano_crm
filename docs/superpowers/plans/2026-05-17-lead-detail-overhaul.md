# Lead Detail Page Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace mock UI in the lead detail page with real DB-connected status management, activity timeline, full-profile edit modal, and a scoring test panel for QA.

**Architecture:** Server actions in `actions.ts` handle all mutations using `createAdminClient()` (service role, bypasses RLS). The page Server Component fetches all data including `purchase_processes`. Client components call server actions then `router.refresh()` to re-hydrate from DB. Schema extended with migration 002 (adds `points` to `lead_events`, makes `temperature_score` nullable, adds `purchase_processes` table).

**Tech Stack:** Next.js 16.2.4 App Router, React 19 (`useTransition`), TypeScript strict, Supabase Postgres (service role), CSS variables design system.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `supabase/migrations/002_lead_events_points.sql` | Create | Schema: points column, nullable score, purchase_processes table |
| `src/lib/types.ts` | Modify | Add `points` to LeadEvent; add PurchaseProcess interface |
| `src/lib/db.ts` | Modify | Add PurchaseProcessRow type + mapPurchaseProcess mapper |
| `src/app/(dashboard)/leads/[id]/actions.ts` | Create | All DB mutations: updateLeadStatus, updateLead, updateLeadNotes, insertScoringEvents, startPurchaseProcess |
| `src/app/(dashboard)/leads/[id]/page.tsx` | Modify | Fetch purchase_processes; pass points in events; pass agents[], sources[], purchaseProcess |
| `src/app/(dashboard)/leads/[id]/lead-detail-client.tsx` | Modify | Status badge, confirm buttons, frozen score, real timeline, wire new components |
| `src/app/(dashboard)/leads/[id]/edit-lead-modal.tsx` | Create | Full-profile edit modal, calls updateLead |
| `src/app/(dashboard)/leads/[id]/scoring-test-panel.tsx` | Create | Scoring event table with checkboxes, calls insertScoringEvents |

---

## Task 1: Schema migration 002

**Files:**
- Create: `supabase/migrations/002_lead_events_points.sql`

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/002_lead_events_points.sql` with this exact content:

```sql
-- Add points delta to events (nullable — system events like lead_created have no points)
ALTER TABLE lead_events ADD COLUMN points integer;

-- Allow NULL score for terminal leads (closed/lost)
ALTER TABLE leads ALTER COLUMN temperature_score DROP NOT NULL;

-- Purchase process details (one row per process_started lead)
CREATE TABLE purchase_processes (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      text        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id    text        NOT NULL REFERENCES tenants(id),
  address      text        NOT NULL,
  loan_type    text        NOT NULL,
  closing_date date,
  notes        text,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE purchase_processes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "purchase_processes_select" ON purchase_processes
  FOR SELECT USING (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE POLICY "purchase_processes_insert" ON purchase_processes
  FOR INSERT WITH CHECK (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE POLICY "purchase_processes_update" ON purchase_processes
  FOR UPDATE USING (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE POLICY "purchase_processes_delete" ON purchase_processes
  FOR DELETE USING (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE INDEX idx_purchase_processes_lead_id ON purchase_processes(lead_id);
```

- [ ] **Step 2: Apply the migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- `name`: `002_lead_events_points`
- `query`: (contents of the file above)

- [ ] **Step 3: Verify the migration applied**

Use `mcp__supabase__execute_sql` with:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name IN ('leads', 'lead_events', 'purchase_processes')
  AND column_name IN ('temperature_score', 'points', 'id')
ORDER BY table_name, column_name;
```
Expected: `temperature_score` shows `is_nullable = YES`, `points` column exists on `lead_events`, `purchase_processes` table exists.

- [ ] **Step 4: Commit**

```
git add supabase/migrations/002_lead_events_points.sql
git commit -m "feat: migration 002 — event points, nullable score, purchase_processes table"
```

---

## Task 2: Update types and DB mappers

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add `points` and `PurchaseProcess` to `src/lib/types.ts`**

Replace the `LeadEvent` interface:
```ts
export interface LeadEvent {
  id: string
  tenantId: string
  leadId: string
  type: string
  description: string
  points: number | null
  createdAt: string
}
```

Add after `LeadEvent`:
```ts
export interface PurchaseProcess {
  id: string
  leadId: string
  tenantId: string
  address: string
  loanType: string
  closingDate?: string
  notes?: string
  createdAt: string
}
```

- [ ] **Step 2: Add `PurchaseProcessRow` and `mapPurchaseProcess` to `src/lib/db.ts`**

Add after the existing `LeadEventRow` interface:
```ts
export interface PurchaseProcessRow {
  id: string
  lead_id: string
  tenant_id: string
  address: string
  loan_type: string
  closing_date: string | null
  notes: string | null
  created_at: string
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
    createdAt: r.created_at,
  }
}
```

Add `PurchaseProcess` to the import in `db.ts` (top of file):
```ts
import type { Agent, Lead, LeadSource, LeadMagnet, PurchaseProcess } from './types'
```

- [ ] **Step 3: Type check**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src/lib/types.ts src/lib/db.ts
git commit -m "feat: add PurchaseProcess type and LeadEvent.points field"
```

---

## Task 3: Create server actions

**Files:**
- Create: `src/app/(dashboard)/leads/[id]/actions.ts`

- [ ] **Step 1: Create `actions.ts` with all five mutations**

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LeadStatus } from '@/lib/types'

const TENANT_ID = 'tenant-aj'

// ─── Score band helper ────────────────────────────────────────────────────────

function scoreToBand(score: number): 'new' | 'nurturing' | 'warm' | 'hot' {
  if (score >= 60) return 'hot'
  if (score >= 35) return 'warm'
  if (score >= 15) return 'nurturing'
  return 'new'
}

// ─── Update status (process_completed / closed / lost only) ──────────────────

export async function updateLeadStatus(
  leadId: string,
  status: 'process_completed' | 'closed' | 'lost'
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  const update: Record<string, unknown> = { status }
  if (status === 'closed' || status === 'lost') {
    update.temperature_score = null
  }

  const { error } = await supabase.from('leads').update(update).eq('id', leadId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

// ─── Update all editable lead fields ─────────────────────────────────────────

export async function updateLead(
  leadId: string,
  fields: {
    firstName: string
    lastName: string
    email: string
    phone: string
    language: string
    agentId: string
    sourceId: string
    lender: string
    notes: string
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('leads')
    .update({
      first_name:  fields.firstName,
      last_name:   fields.lastName,
      email:       fields.email,
      phone:       fields.phone   || null,
      language:    fields.language,
      agent_id:    fields.agentId,
      source_id:   fields.sourceId,
      lender:      fields.lender  || null,
      notes:       fields.notes   || null,
    })
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

// ─── Update notes only (inline notes card) ───────────────────────────────────

export async function updateLeadNotes(
  leadId: string,
  notes: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  const { error } = await supabase
    .from('leads')
    .update({ notes: notes || null })
    .eq('id', leadId)

  if (error) return { ok: false, error: error.message }

  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

// ─── Insert scoring events + recalculate score + auto-promote status ──────────

export async function insertScoringEvents(
  leadId: string,
  events: Array<{ type: string; description: string; points: number }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  const { data: lead, error: fetchErr } = await supabase
    .from('leads')
    .select('temperature_score, status')
    .eq('id', leadId)
    .single()

  if (fetchErr || !lead) return { ok: false, error: 'Lead no encontrado' }

  const FROZEN: LeadStatus[] = ['process_started', 'process_completed', 'closed', 'lost']
  if (FROZEN.includes(lead.status as LeadStatus)) {
    return { ok: false, error: 'El scoring está congelado para este lead' }
  }

  const rows = events.map(e => ({
    lead_id:     leadId,
    tenant_id:   TENANT_ID,
    type:        e.type,
    description: e.description,
    points:      e.points,
  }))

  const { error: insertErr } = await supabase.from('lead_events').insert(rows)
  if (insertErr) return { ok: false, error: insertErr.message }

  const pointsSum  = events.reduce((sum, e) => sum + e.points, 0)
  const current    = (lead.temperature_score as number | null) ?? 0
  const newScore   = Math.min(100, Math.max(0, current + pointsSum))
  const newStatus  = scoreToBand(newScore)

  const { error: updateErr } = await supabase
    .from('leads')
    .update({ temperature_score: newScore, status: newStatus })
    .eq('id', leadId)

  if (updateErr) return { ok: false, error: updateErr.message }

  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}

// ─── Start purchase process ───────────────────────────────────────────────────

export async function startPurchaseProcess(
  leadId: string,
  data: { address: string; loanType: string; closingDate: string; notes: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  const { error: insertErr } = await supabase.from('purchase_processes').insert({
    lead_id:      leadId,
    tenant_id:    TENANT_ID,
    address:      data.address,
    loan_type:    data.loanType,
    closing_date: data.closingDate || null,
    notes:        data.notes       || null,
  })

  if (insertErr) return { ok: false, error: insertErr.message }

  const { error: updateErr } = await supabase
    .from('leads')
    .update({ status: 'process_started' })
    .eq('id', leadId)

  if (updateErr) return { ok: false, error: updateErr.message }

  revalidatePath(`/leads/${leadId}`)
  return { ok: true }
}
```

- [ ] **Step 2: Type check**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/app/(dashboard)/leads/[id]/actions.ts
git commit -m "feat: add lead detail server actions (status, edit, notes, scoring, process)"
```

---

## Task 4: Update `page.tsx`

**Files:**
- Modify: `src/app/(dashboard)/leads/[id]/page.tsx`

- [ ] **Step 1: Rewrite `page.tsx` to fetch all needed data**

Replace the entire file with:

```ts
import { createAdminClient } from '@/lib/supabase/admin'
import {
  mapAgent, mapLead, mapSource, mapPurchaseProcess,
  type AgentRow, type LeadRow, type LeadSourceRow, type PurchaseProcessRow,
} from '@/lib/db'
import { LeadDetailClient } from './lead-detail-client'
import { notFound } from 'next/navigation'

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createAdminClient()

  const [
    { data: rawLead },
    { data: rawAgents },
    { data: rawSources },
    { data: rawEvents },
    { data: rawProcess },
  ] = await Promise.all([
    supabase.from('leads').select('*').eq('id', id).single(),
    supabase.from('agents').select('*'),
    supabase.from('lead_sources').select('*'),
    supabase.from('lead_events').select('*').eq('lead_id', id).order('created_at', { ascending: false }),
    supabase.from('purchase_processes').select('*').eq('lead_id', id).maybeSingle(),
  ])

  if (!rawLead) notFound()

  const lead            = mapLead(rawLead as LeadRow)
  const agents          = (rawAgents  ?? []).map(r => mapAgent(r as AgentRow))
  const sources         = (rawSources ?? []).map(r => mapSource(r as LeadSourceRow))
  const purchaseProcess = rawProcess ? mapPurchaseProcess(rawProcess as PurchaseProcessRow) : null

  const events = (rawEvents ?? []).map(r => ({
    id:          r.id as string,
    tenantId:    r.tenant_id as string,
    leadId:      r.lead_id as string,
    type:        r.type as string,
    description: r.description as string,
    points:      r.points as number | null,
    createdAt:   r.created_at as string,
  }))

  return (
    <LeadDetailClient
      lead={lead}
      agent={agents.find(a => a.id === lead.agentId)}
      agents={agents}
      source={sources.find(s => s.id === lead.sourceId)}
      sources={sources}
      events={events}
      purchaseProcess={purchaseProcess}
    />
  )
}
```

- [ ] **Step 2: Type check**

```
npx tsc --noEmit
```
Expected: TypeScript will warn that `LeadDetailClient` doesn't accept `agents`, `sources`, `purchaseProcess` yet — this is expected and will be fixed in Task 5.

- [ ] **Step 3: Commit**

```
git add src/app/(dashboard)/leads/[id]/page.tsx
git commit -m "feat: lead page fetches purchase_processes, passes agents+sources+points to client"
```

---

## Task 5: `lead-detail-client.tsx` — props, imports, state, helpers

**Files:**
- Modify: `src/app/(dashboard)/leads/[id]/lead-detail-client.tsx`

- [ ] **Step 1: Replace the imports block (top of file)**

Replace lines 1–13 with:

```ts
'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { STATUS_CONFIG, SOURCE_CONFIG, LANGUAGE_CONFIG } from '@/lib/config'
import type { Lead, Agent, LeadSource, LeadEvent, LeadStatus, PurchaseProcess } from '@/lib/types'
import { updateLeadStatus, updateLeadNotes, startPurchaseProcess } from './actions'
import { EditLeadModal } from './edit-lead-modal'
import { ScoringTestPanel } from './scoring-test-panel'
import {
  ArrowLeft, MoreHorizontal, X,
  UserPlus, Mail, FileDown, MousePointer2, Calendar,
  ArrowRightCircle, CheckCircle2, Circle, Phone,
  TrendingUp, TrendingDown, Activity,
  MessageCircle, XCircle,
} from 'lucide-react'
```

- [ ] **Step 2: Replace the `LeadDetailProps` interface**

Replace the existing `LeadDetailProps` interface with:

```ts
interface LeadDetailProps {
  lead: Lead
  agent: Agent | undefined
  agents: Agent[]
  source: LeadSource | undefined
  sources: LeadSource[]
  events: LeadEvent[]
  purchaseProcess: PurchaseProcess | null
}
```

- [ ] **Step 3: Replace the state declarations inside `LeadDetailClient`**

The function signature and state block (currently lines 185–210) becomes:

```ts
export function LeadDetailClient({ lead, agent, agents, source, sources, events, purchaseProcess }: LeadDetailProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [currentStatus, setCurrentStatus] = useState<LeadStatus>(lead.status)
  const [notes, setNotes]                 = useState(lead.notes ?? '')
  const [savedNotes, setSavedNotes]       = useState(lead.notes ?? '')
  const [showEditModal, setShowEditModal]   = useState(false)
  const [confirmingClosed, setConfirmingClosed] = useState(false)
  const [confirmingLost, setConfirmingLost]     = useState(false)
  const [actionError, setActionError]           = useState<string | null>(null)

  // Sync currentStatus when server refreshes lead.status (e.g. after scoring auto-promotion)
  useEffect(() => { setCurrentStatus(lead.status) }, [lead.status])

  // Process modal state
  const [showProcessModal, setShowProcessModal] = useState(false)
  const [modalAddress, setModalAddress]         = useState('')
  const [modalLoanType, setModalLoanType]       = useState('VA Loan')
  const [modalClosingDate, setModalClosingDate] = useState('')
  const [modalNotes, setModalNotes]             = useState('')
```

- [ ] **Step 4: Remove `generateMockEvents` and update derived values**

Delete the entire `generateMockEvents` function (lines 59–124 in the original).

Delete the `TLIcon` function (lines 128–140) — it will be replaced in Task 8.

Replace the derived values block (after state declarations) with:

```ts
  const FROZEN_STATUSES: LeadStatus[] = ['process_started', 'process_completed', 'closed', 'lost']
  const isScoreFrozen   = FROZEN_STATUSES.includes(currentStatus)
  const isProcessActive = currentStatus === 'process_started' || currentStatus === 'process_completed'
  const isProcessDisabled = currentStatus === 'closed' || currentStatus === 'lost'

  const score      = lead.temperatureScore  // null or number
  const tColor     = score !== null ? tempColor(score) : 'var(--text-muted)'
  const filledPills = score !== null ? Math.round(score / 10) : 0

  const sourceCfg  = source ? SOURCE_CONFIG[source.type] : null
  const langCfg    = LANGUAGE_CONFIG[lead.language]
  const initials   = getInitials(lead.firstName, lead.lastName)
  const sourceName = source?.name ?? 'fuente desconocida'
```

- [ ] **Step 5: Type check**

```
npx tsc --noEmit
```
Expected: errors about missing JSX content referencing removed variables — this is expected and will be fixed in subsequent tasks.

- [ ] **Step 6: Commit**

```
git add src/app/(dashboard)/leads/[id]/lead-detail-client.tsx
git commit -m "refactor: lead detail — update props, imports, state, remove mock events"
```

---

## Task 6: `lead-detail-client.tsx` — header, temperature card, agent card

**Files:**
- Modify: `src/app/(dashboard)/leads/[id]/lead-detail-client.tsx`

- [ ] **Step 1: Replace the header "Status select + more button" section**

Find the block starting with `{/* Status select + more button */}` and replace it with:

```tsx
          {/* Status badge + more button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              padding: '5px 12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              background: STATUS_CONFIG[currentStatus].bgColor,
              color: STATUS_CONFIG[currentStatus].color,
              border: `1px solid ${STATUS_CONFIG[currentStatus].color}50`,
            }}>
              {STATUS_CONFIG[currentStatus].label}
            </span>
            <button
              onClick={() => setShowEditModal(true)}
              style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                cursor: 'pointer', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
```

- [ ] **Step 2: Replace the Temperature card body**

Find `{/* Card 2: Temperature */}` and replace its entire inner content with:

```tsx
          {/* Card 2: Temperature */}
          <div style={CARD}>
            <div style={CARD_TITLE}>Temperatura del lead</div>

            {isScoreFrozen ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Score congelado — lead {STATUS_CONFIG[currentStatus].label}
              </div>
            ) : (
              <>
                {/* 10 pills */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} style={{
                      flex: 1, height: '12px', borderRadius: '3px',
                      background: i < filledPills ? tColor : 'var(--bg-overlay)',
                    }} />
                  ))}
                </div>
                {/* Continuous bar */}
                <div style={{ width: '100%', height: '6px', background: 'var(--bg-overlay)', borderRadius: '3px', marginBottom: '8px' }}>
                  <div style={{ width: `${score ?? 0}%`, height: '100%', background: tColor, borderRadius: '3px' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: tColor }}>{score !== null ? tempLabel(score) : '—'}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Score {score ?? 0}/100</span>
                </div>
              </>
            )}
          </div>
```

- [ ] **Step 3: Replace the Agent card body — remove "Ver Calendly" button**

Find the agent card section and replace the button:

```tsx
              {/* Remove this button entirely: */}
              {/* <button style={...}><Calendar size={13} /> Ver Calendly</button> */}
```

The agent card after the phone number line should end with no buttons. The final agent card render:

```tsx
          {/* Agent card */}
          <div style={CARD}>
            <div style={CARD_TITLE}>Agente asignado</div>
            {agent ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: `${agent.accentColor}26`, color: agent.accentColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 600, flexShrink: 0,
                  }}>
                    {agent.avatarInitials}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{SPECIALTY_LABEL[agent.specialty]}</div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{agent.email}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{agent.phone ?? '—'}</div>
              </>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sin agente asignado</div>
            )}
          </div>
```

- [ ] **Step 4: Type check**

```
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```
git add src/app/(dashboard)/leads/[id]/lead-detail-client.tsx
git commit -m "feat: lead detail — status badge, frozen score display, remove calendly button"
```

---

## Task 7: `lead-detail-client.tsx` — actions card + proceso de compra

**Files:**
- Modify: `src/app/(dashboard)/leads/[id]/lead-detail-client.tsx`

- [ ] **Step 1: Replace the quick actions card**

Find `{/* Quick actions card */}` and replace the entire card with:

```tsx
          {/* Quick actions card */}
          <div style={{ ...CARD, marginBottom: 0 }}>
            <div style={CARD_TITLE}>Acciones</div>

            {actionError && (
              <div style={{ fontSize: '12px', color: '#C97B6B', marginBottom: '10px', padding: '8px', background: 'rgba(201,123,107,0.08)', borderRadius: '6px' }}>
                {actionError}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Enviar email */}
              <button className="action-btn" style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', textAlign: 'left',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: '8px', padding: '9px 14px',
                fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)',
              }}>
                <Mail size={14} /> Enviar email
              </button>

              {/* WhatsApp */}
              <button className="action-btn" style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', textAlign: 'left',
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: '8px', padding: '9px 14px',
                fontSize: '13px', cursor: 'pointer', color: 'var(--text-secondary)',
              }}>
                <MessageCircle size={14} /> WhatsApp
              </button>

              {/* Marcar como Cerrado */}
              {confirmingClosed ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={isPending}
                    onClick={() => {
                      setActionError(null)
                      startTransition(async () => {
                        const result = await updateLeadStatus(lead.id, 'closed')
                        if (result.ok) {
                          setCurrentStatus('closed')
                          setConfirmingClosed(false)
                          router.refresh()
                        } else {
                          setActionError(result.error)
                          setConfirmingClosed(false)
                        }
                      })
                    }}
                    style={{
                      flex: 1, padding: '9px 14px', fontSize: '13px', fontWeight: 500,
                      background: 'rgba(107,163,104,0.12)', color: '#6BA368',
                      border: '1px solid rgba(107,163,104,0.3)',
                      borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    {isPending ? 'Guardando...' : '¿Confirmar cierre?'}
                  </button>
                  <button
                    onClick={() => setConfirmingClosed(false)}
                    style={{
                      padding: '9px 10px', fontSize: '12px',
                      background: 'transparent', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  disabled={currentStatus === 'closed' || currentStatus === 'lost'}
                  onClick={() => setConfirmingClosed(true)}
                  className="action-btn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    width: '100%', textAlign: 'left',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', padding: '9px 14px',
                    fontSize: '13px', cursor: currentStatus === 'closed' || currentStatus === 'lost' ? 'not-allowed' : 'pointer',
                    color: currentStatus === 'closed' || currentStatus === 'lost' ? 'var(--text-muted)' : 'var(--text-secondary)',
                    opacity: currentStatus === 'closed' || currentStatus === 'lost' ? 0.5 : 1,
                  }}
                >
                  <CheckCircle2 size={14} /> Marcar como Cerrado
                </button>
              )}

              {/* Marcar como Perdido */}
              {confirmingLost ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    disabled={isPending}
                    onClick={() => {
                      setActionError(null)
                      startTransition(async () => {
                        const result = await updateLeadStatus(lead.id, 'lost')
                        if (result.ok) {
                          setCurrentStatus('lost')
                          setConfirmingLost(false)
                          router.refresh()
                        } else {
                          setActionError(result.error)
                          setConfirmingLost(false)
                        }
                      })
                    }}
                    style={{
                      flex: 1, padding: '9px 14px', fontSize: '13px', fontWeight: 500,
                      background: 'rgba(201,123,107,0.08)', color: '#C97B6B',
                      border: '1px solid rgba(201,123,107,0.3)',
                      borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    {isPending ? 'Guardando...' : '¿Confirmar pérdida?'}
                  </button>
                  <button
                    onClick={() => setConfirmingLost(false)}
                    style={{
                      padding: '9px 10px', fontSize: '12px',
                      background: 'transparent', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  disabled={currentStatus === 'closed' || currentStatus === 'lost'}
                  onClick={() => setConfirmingLost(true)}
                  className="action-btn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    width: '100%', textAlign: 'left',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', padding: '9px 14px',
                    fontSize: '13px', cursor: currentStatus === 'closed' || currentStatus === 'lost' ? 'not-allowed' : 'pointer',
                    color: 'rgba(201,123,107,0.7)',
                    opacity: currentStatus === 'closed' || currentStatus === 'lost' ? 0.5 : 1,
                  }}
                >
                  <XCircle size={14} /> Marcar como Perdido
                </button>
              )}
            </div>
          </div>
```

- [ ] **Step 2: Replace the Proceso de Compra card**

Find `{/* Card 4: Process */}` and replace the entire card:

```tsx
          {/* Card 4: Process */}
          <div style={{ ...CARD, marginBottom: 0, position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Proceso de Compra</div>
              {isProcessActive && (
                <span style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                  background: STATUS_CONFIG[currentStatus].bgColor,
                  color: STATUS_CONFIG[currentStatus].color,
                }}>
                  {STATUS_CONFIG[currentStatus].label}
                </span>
              )}
            </div>

            {/* Disabled overlay when closed/lost */}
            {isProcessDisabled && (
              <div style={{
                position: 'absolute', inset: 0, borderRadius: '12px',
                background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2, backdropFilter: 'blur(1px)',
              }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '6px 12px', background: 'var(--bg-elevated)', borderRadius: '6px' }}>
                  Proceso deshabilitado — lead {STATUS_CONFIG[currentStatus].label.toLowerCase()}
                </span>
              </div>
            )}

            {isProcessActive && purchaseProcess ? (
              <>
                {[
                  { label: 'Propiedad',   value: purchaseProcess.address },
                  { label: 'Tipo loan',   value: purchaseProcess.loanType },
                  { label: 'Inicio',      value: new Date(purchaseProcess.createdAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) },
                  { label: 'Cierre est.', value: purchaseProcess.closingDate ?? '—' },
                ].map((row, idx, arr) => (
                  <div
                    key={row.label}
                    style={{
                      display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                      borderBottom: idx < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                    }}
                  >
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '100px' }}>{row.label}</span>
                    <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{row.value}</span>
                  </div>
                ))}

                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', margin: '16px 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Pasos del proceso
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: currentStatus === 'process_started' ? '16px' : '0' }}>
                  {PROCESS_STEPS.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {step.done
                        ? <CheckCircle2 size={16} style={{ color: '#6BA368', flexShrink: 0 }} />
                        : <Circle       size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      }
                      <span style={{ fontSize: '13px', color: step.done ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>

                {currentStatus === 'process_started' && (
                  <button
                    disabled={isPending}
                    onClick={() => {
                      setActionError(null)
                      startTransition(async () => {
                        const result = await updateLeadStatus(lead.id, 'process_completed')
                        if (result.ok) {
                          setCurrentStatus('process_completed')
                          router.refresh()
                        } else {
                          setActionError(result.error)
                        }
                      })
                    }}
                    style={{
                      width: '100%', padding: '8px 16px',
                      background: 'rgba(107,163,104,0.12)', color: '#6BA368',
                      border: '1px solid rgba(107,163,104,0.3)',
                      borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    {isPending ? 'Guardando...' : 'Marcar como Completado'}
                  </button>
                )}
              </>
            ) : !isProcessActive && !isProcessDisabled ? (
              <>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                  Este lead aún no tiene un proceso de compra activo.
                </p>
                <button
                  onClick={() => setShowProcessModal(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 16px', fontSize: '13px',
                    background: 'rgba(201,169,110,0.08)',
                    border: '1px solid var(--accent-gold)',
                    color: 'var(--accent-gold)',
                    borderRadius: '8px', cursor: 'pointer',
                  }}
                >
                  + Iniciar proceso de compra
                </button>
              </>
            ) : null}
          </div>
```

- [ ] **Step 3: Update the process modal submit handler**

Find the "Iniciar proceso →" button's `onClick` inside the modal and replace with:

```tsx
              <button
                disabled={isPending || !modalAddress}
                onClick={() => {
                  setActionError(null)
                  startTransition(async () => {
                    const result = await startPurchaseProcess(lead.id, {
                      address:     modalAddress,
                      loanType:    modalLoanType,
                      closingDate: modalClosingDate,
                      notes:       modalNotes,
                    })
                    if (result.ok) {
                      setShowProcessModal(false)
                      setCurrentStatus('process_started')
                      setModalAddress('')
                      setModalClosingDate('')
                      setModalNotes('')
                      router.refresh()
                    } else {
                      setActionError(result.error)
                    }
                  })
                }}
                style={{
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: !modalAddress ? 'var(--bg-overlay)' : 'var(--accent-gold)',
                  color: !modalAddress ? 'var(--text-muted)' : 'var(--bg-base)',
                  border: 'none', cursor: !modalAddress ? 'not-allowed' : 'pointer',
                }}
              >
                {isPending ? 'Guardando...' : 'Iniciar proceso →'}
              </button>
```

- [ ] **Step 4: Wire the inline "Guardar nota" button to the DB**

Find the `onClick={() => setSavedNotes(notes)}` in the notes card and replace:

```tsx
                  onClick={() => {
                    startTransition(async () => {
                      const result = await updateLeadNotes(lead.id, notes)
                      if (result.ok) {
                        setSavedNotes(notes)
                        router.refresh()
                      }
                    })
                  }}
```

- [ ] **Step 5: Type check**

```
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```
git add src/app/(dashboard)/leads/[id]/lead-detail-client.tsx
git commit -m "feat: lead detail — actions card with confirm, proceso de compra DB-connected"
```

---

## Task 8: `lead-detail-client.tsx` — real activity timeline

**Files:**
- Modify: `src/app/(dashboard)/leads/[id]/lead-detail-client.tsx`

- [ ] **Step 1: Add the icon mapping function after the helpers block**

Add this function after `getInitials` and before `PROCESS_STEPS`:

```ts
// ─── Timeline icon + color by event type ─────────────────────────────────────

function eventMeta(type: string): { icon: React.ReactNode; color: string } {
  const s = 14
  switch (type) {
    case 'lead_created':           return { icon: <UserPlus size={s} />,          color: '#5B8EC9' }
    case 'email_opened':           return { icon: <Mail size={s} />,              color: '#C9A96E' }
    case 'email_clicked':          return { icon: <MousePointer2 size={s} />,     color: '#C9A96E' }
    case 'lm_downloaded':
    case 'lm_downloaded_2':
    case 'lm_downloaded_3plus':    return { icon: <FileDown size={s} />,          color: '#5AAFA0' }
    case 'consultation_scheduled': return { icon: <Calendar size={s} />,          color: '#9B72CF' }
    case 'consultation_attended':  return { icon: <CheckCircle2 size={s} />,      color: '#6BA368' }
    case 'reply_received':         return { icon: <MessageCircle size={s} />,     color: '#5AAFA0' }
    case 'phone_call':             return { icon: <Phone size={s} />,             color: '#5B8EC9' }
    case 'unsubscribed':           return { icon: <XCircle size={s} />,           color: '#C97B6B' }
    case 'status_changed':         return { icon: <ArrowRightCircle size={s} />,  color: '#9B72CF' }
    case 'score_manual':           return { icon: <Activity size={s} />,          color: '#C9A96E' }
    default:                       return { icon: <Circle size={s} />,            color: '#C9A96E' }
  }
}
```

- [ ] **Step 2: Replace the entire timeline section**

Find `{/* ── Timeline ── */}` and replace the entire timeline block with:

```tsx
      {/* ── Timeline ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px 24px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Historial de actividad</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{events.length} eventos</span>
        </div>

        {events.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Sin actividad registrada todavía.
          </div>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', left: '13px', top: '14px', bottom: '14px',
              width: '2px', background: 'var(--border-subtle)',
            }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {events.map(event => {
                const { icon, color } = eventMeta(event.type)
                return (
                  <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '16px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      background: `${color}1F`, color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, position: 'relative', zIndex: 1,
                    }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, paddingTop: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                          {event.description}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          {event.points !== null && event.points !== undefined && (
                            <span style={{
                              fontSize: '11px', fontWeight: 600,
                              color: event.points > 0 ? '#6BA368' : '#C97B6B',
                              background: event.points > 0 ? 'rgba(107,163,104,0.12)' : 'rgba(201,123,107,0.12)',
                              padding: '2px 6px', borderRadius: '4px',
                            }}>
                              {event.points > 0 ? `+${event.points}` : event.points} pts
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {formatDateTime(event.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
```

- [ ] **Step 3: Type check**

```
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```
git add src/app/(dashboard)/leads/[id]/lead-detail-client.tsx
git commit -m "feat: lead detail — real activity timeline with event icons and points badges"
```

---

## Task 9: Create `edit-lead-modal.tsx`

**Files:**
- Create: `src/app/(dashboard)/leads/[id]/edit-lead-modal.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LANGUAGE_CONFIG, SOURCE_CONFIG } from '@/lib/config'
import type { Lead, Agent, LeadSource } from '@/lib/types'
import { updateLead } from './actions'
import { X } from 'lucide-react'

interface EditLeadModalProps {
  lead: Lead
  agents: Agent[]
  sources: LeadSource[]
  isOpen: boolean
  onClose: () => void
}

const LOAN_TYPES = ['VA Loan', 'FHA', 'Convencional', 'USDA', 'Jumbo', 'Cash']

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)', borderRadius: '8px',
  padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)',
  display: 'block', marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
}

export function EditLeadModal({ lead, agents, sources, isOpen, onClose }: EditLeadModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [firstName, setFirstName] = useState(lead.firstName)
  const [lastName,  setLastName]  = useState(lead.lastName)
  const [email,     setEmail]     = useState(lead.email)
  const [phone,     setPhone]     = useState(lead.phone ?? '')
  const [language,  setLanguage]  = useState(lead.language)
  const [agentId,   setAgentId]   = useState(lead.agentId)
  const [sourceId,  setSourceId]  = useState(lead.sourceId)
  const [lender,    setLender]    = useState(lead.lender ?? '')
  const [notes,     setNotes]     = useState(lead.notes ?? '')
  const [error,     setError]     = useState<string | null>(null)

  if (!isOpen) return null

  function handleSubmit() {
    setError(null)
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('Nombre, apellido y email son requeridos.')
      return
    }
    startTransition(async () => {
      const result = await updateLead(lead.id, {
        firstName, lastName, email, phone, language, agentId, sourceId, lender, notes,
      })
      if (result.ok) {
        router.refresh()
        onClose()
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 50 }}
        onClick={onClose}
      />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
        borderRadius: '16px', padding: '24px',
        width: '520px', maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto',
        zIndex: 51,
      }}>
        <style>{`.edit-input:focus { border-color: var(--border-accent) !important; outline: none; }`}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Editar lead</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>

          {/* Name row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={LABEL_STYLE}>Nombre</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)}
                className="edit-input" style={INPUT_STYLE} />
            </div>
            <div>
              <label style={LABEL_STYLE}>Apellido</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)}
                className="edit-input" style={INPUT_STYLE} />
            </div>
          </div>

          {/* Email */}
          <div>
            <label style={LABEL_STYLE}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="edit-input" style={INPUT_STYLE} />
          </div>

          {/* Phone */}
          <div>
            <label style={LABEL_STYLE}>Teléfono (opcional)</label>
            <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
              className="edit-input" style={INPUT_STYLE} placeholder="(305) 555-0000" />
          </div>

          {/* Language */}
          <div>
            <label style={LABEL_STYLE}>Idioma</label>
            <select value={language} onChange={e => setLanguage(e.target.value as typeof language)}
              className="edit-input" style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}>
              {Object.entries(LANGUAGE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key} style={{ background: '#16181C' }}>
                  {cfg.flag} {cfg.label}
                </option>
              ))}
            </select>
          </div>

          {/* Agent */}
          <div>
            <label style={LABEL_STYLE}>Agente asignado</label>
            <select value={agentId} onChange={e => setAgentId(e.target.value)}
              className="edit-input" style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}>
              {agents.map(a => (
                <option key={a.id} value={a.id} style={{ background: '#16181C' }}>{a.name}</option>
              ))}
            </select>
          </div>

          {/* Source */}
          <div>
            <label style={LABEL_STYLE}>Fuente</label>
            <select value={sourceId} onChange={e => setSourceId(e.target.value)}
              className="edit-input" style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}>
              {sources.map(s => (
                <option key={s.id} value={s.id} style={{ background: '#16181C' }}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Lender */}
          <div>
            <label style={LABEL_STYLE}>Prestamista (opcional)</label>
            <input type="text" value={lender} onChange={e => setLender(e.target.value)}
              className="edit-input" style={INPUT_STYLE} placeholder="Nombre del prestamista" />
          </div>

          {/* Notes */}
          <div>
            <label style={LABEL_STYLE}>Notas</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="edit-input"
              style={{ ...INPUT_STYLE, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
              placeholder="Notas internas..." />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ fontSize: '12px', color: '#C97B6B', marginBottom: '14px', padding: '8px', background: 'rgba(201,123,107,0.08)', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button onClick={onClose} style={{
            padding: '8px 16px', fontSize: '13px', borderRadius: '8px',
            background: 'transparent', border: '1px solid var(--border-subtle)',
            color: 'var(--text-muted)', cursor: 'pointer',
          }}>
            Cancelar
          </button>
          <button
            disabled={isPending}
            onClick={handleSubmit}
            style={{
              padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
              background: isPending ? 'var(--bg-overlay)' : 'var(--accent-gold)',
              color: isPending ? 'var(--text-muted)' : 'var(--bg-base)',
              border: 'none', cursor: isPending ? 'not-allowed' : 'pointer',
            }}
          >
            {isPending ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 2: Type check**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/app/(dashboard)/leads/[id]/edit-lead-modal.tsx
git commit -m "feat: add EditLeadModal component with full profile edit and DB save"
```

---

## Task 10: Create `scoring-test-panel.tsx`

**Files:**
- Create: `src/app/(dashboard)/leads/[id]/scoring-test-panel.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { LeadStatus } from '@/lib/types'
import { insertScoringEvents } from './actions'

interface ScoringTestPanelProps {
  leadId: string
  currentStatus: LeadStatus
  currentScore: number | null
}

// ─── Scoring event table (from CLAUDE.md scoring model) ───────────────────────

const SCORING_EVENTS = [
  // Nuclear
  { category: 'Nuclear',  label: 'Consulta / visita agendada',           type: 'consultation_scheduled',  points:  50 },
  { category: 'Nuclear',  label: 'Consulta / visita atendida',            type: 'consultation_attended',   points:  30 },
  { category: 'Nuclear',  label: 'Solicitud de valoración AVM',           type: 'avm_request',             points:  40 },
  { category: 'Nuclear',  label: 'Consulta sobre propiedad específica',   type: 'property_inquiry',        points:  30 },
  { category: 'Nuclear',  label: 'Respuesta a email o WhatsApp',          type: 'reply_received',          points:  30 },
  { category: 'Nuclear',  label: 'Llamada atendida (>2 min)',              type: 'phone_call',              points:  25 },
  // Medio
  { category: 'Medio',    label: 'Click en CTA de email',                 type: 'email_clicked',           points:  15 },
  { category: 'Medio',    label: '2° lead magnet descargado',              type: 'lm_downloaded_2',         points:  20 },
  { category: 'Medio',    label: '3°+ lead magnet descargado',            type: 'lm_downloaded_3plus',     points:  25 },
  { category: 'Medio',    label: 'Visita a página de servicios/precios',  type: 'page_visit_pricing',      points:  15 },
  { category: 'Medio',    label: 'Suscripción al newsletter',             type: 'newsletter_subscribed',   points:  10 },
  // Bajo
  { category: 'Bajo',     label: 'Email abierto',                         type: 'email_opened',            points:   2 },
  { category: 'Bajo',     label: 'Visita genérica a página',              type: 'page_visit_generic',      points:   3 },
  // Negativo
  { category: 'Negativo', label: 'Desuscripción de email',                type: 'unsubscribed',            points: -50 },
  { category: 'Negativo', label: 'Hard bounce',                           type: 'hard_bounce',             points: -30 },
  { category: 'Negativo', label: 'Queja de spam',                         type: 'spam_complaint',          points: -100 },
  { category: 'Negativo', label: 'Respuesta de rechazo ("stop", "no")',   type: 'reply_negative',          points: -40 },
] as const

type EventType = typeof SCORING_EVENTS[number]['type']

const FROZEN_STATUSES: LeadStatus[] = ['process_started', 'process_completed', 'closed', 'lost']

const CATEGORY_ORDER = ['Nuclear', 'Medio', 'Bajo', 'Negativo']

export function ScoringTestPanel({ leadId, currentStatus, currentScore }: ScoringTestPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [checked, setChecked] = useState<Set<EventType>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isFrozen = FROZEN_STATUSES.includes(currentStatus)

  function toggle(type: EventType) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
    setSuccess(false)
  }

  function handleSave() {
    if (checked.size === 0) return
    setError(null)
    setSuccess(false)

    const selected = SCORING_EVENTS
      .filter(e => checked.has(e.type))
      .map(e => ({
        type:        e.type,
        description: e.label,
        points:      e.points,
      }))

    startTransition(async () => {
      const result = await insertScoringEvents(leadId, selected)
      if (result.ok) {
        setChecked(new Set())
        setSuccess(true)
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  const pointsDelta = SCORING_EVENTS
    .filter(e => checked.has(e.type))
    .reduce((sum, e) => sum + e.points, 0)

  const previewScore = currentScore !== null
    ? Math.min(100, Math.max(0, currentScore + pointsDelta))
    : null

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
      borderRadius: '12px', padding: '20px 24px', marginTop: '24px', marginBottom: '0',
      position: 'relative',
    }}>
      {/* Disabled overlay */}
      {isFrozen && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '12px',
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 2, backdropFilter: 'blur(2px)',
        }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '8px 16px', background: 'var(--bg-elevated)', borderRadius: '8px' }}>
            Score congelado — este lead está fuera del funnel activo
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Scoring Test</span>
          <span style={{
            fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
            color: '#C9A96E', background: 'rgba(201,169,110,0.12)',
            padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase',
          }}>
            DEV
          </span>
        </div>
        {currentScore !== null && (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Score actual: <strong style={{ color: 'var(--text-primary)' }}>{currentScore}</strong>
            {checked.size > 0 && previewScore !== null && (
              <span style={{ color: pointsDelta >= 0 ? '#6BA368' : '#C97B6B' }}>
                {' → '}{previewScore} ({pointsDelta > 0 ? '+' : ''}{pointsDelta} pts)
              </span>
            )}
          </span>
        )}
      </div>

      {/* Event table */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {CATEGORY_ORDER.map(category => {
          const categoryEvents = SCORING_EVENTS.filter(e => e.category === category)
          return (
            <div key={category}>
              {/* Category header */}
              <div style={{
                fontSize: '10px', fontWeight: 600, letterSpacing: '0.08em',
                color: 'var(--text-muted)', textTransform: 'uppercase',
                padding: '10px 0 6px',
                borderTop: category !== 'Nuclear' ? '1px solid var(--border-subtle)' : 'none',
                marginTop: category !== 'Nuclear' ? '4px' : '0',
              }}>
                {category}
              </div>

              {categoryEvents.map(event => (
                <label
                  key={event.type}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '7px 8px', borderRadius: '6px', cursor: 'pointer',
                    background: checked.has(event.type) ? 'var(--bg-elevated)' : 'transparent',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked.has(event.type)}
                    onChange={() => toggle(event.type)}
                    style={{ width: '14px', height: '14px', accentColor: 'var(--accent-gold)', cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-secondary)' }}>
                    {event.label}
                  </span>
                  <span style={{
                    fontSize: '12px', fontWeight: 600,
                    color: event.points > 0 ? '#6BA368' : '#C97B6B',
                    background: event.points > 0 ? 'rgba(107,163,104,0.12)' : 'rgba(201,123,107,0.12)',
                    padding: '2px 7px', borderRadius: '4px', flexShrink: 0,
                  }}>
                    {event.points > 0 ? `+${event.points}` : event.points} pts
                  </span>
                </label>
              ))}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', gap: '12px' }}>
        <div>
          {error && (
            <span style={{ fontSize: '12px', color: '#C97B6B' }}>{error}</span>
          )}
          {success && (
            <span style={{ fontSize: '12px', color: '#6BA368' }}>Eventos guardados correctamente.</span>
          )}
        </div>
        <button
          disabled={isPending || checked.size === 0}
          onClick={handleSave}
          style={{
            padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
            background: checked.size === 0 || isPending ? 'var(--bg-overlay)' : 'var(--accent-gold)',
            color: checked.size === 0 || isPending ? 'var(--text-muted)' : 'var(--bg-base)',
            border: 'none', cursor: checked.size === 0 || isPending ? 'not-allowed' : 'pointer',
          }}
        >
          {isPending ? 'Guardando...' : `Guardar${checked.size > 0 ? ` (${checked.size})` : ''}`}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type check**

```
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/app/(dashboard)/leads/[id]/scoring-test-panel.tsx
git commit -m "feat: add ScoringTestPanel with all scoring events from CLAUDE.md spec"
```

---

## Task 11: Wire `EditLeadModal` and `ScoringTestPanel` in `lead-detail-client.tsx`

**Files:**
- Modify: `src/app/(dashboard)/leads/[id]/lead-detail-client.tsx`

- [ ] **Step 1: Add `ScoringTestPanel` between the two-column grid and the timeline**

Find the line `{/* ── Timeline ── */}` and add this block immediately before it:

```tsx
      {/* ── Scoring test panel ── */}
      <ScoringTestPanel
        leadId={lead.id}
        currentStatus={currentStatus}
        currentScore={lead.temperatureScore}
      />
```

- [ ] **Step 2: Add `EditLeadModal` before the closing `</div>` of the component**

Find the `{/* ── Modal: Iniciar proceso ── */}` block. Add this immediately after it (before the closing `</div>`):

```tsx
      {/* ── Modal: Edit lead ── */}
      <EditLeadModal
        lead={lead}
        agents={agents}
        sources={sources}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
      />
```

- [ ] **Step 3: Remove unused imports**

Remove `ChevronDown`, `Flame`, `TrendingUp`, `TrendingDown` from the lucide-react import line (they are no longer used in the component). Also remove the `scoringFactors` derived variable block if it still exists.

- [ ] **Step 4: Full type check and lint**

```
npx tsc --noEmit
npm run lint
```
Expected: no errors, no warnings.

- [ ] **Step 5: Commit**

```
git add src/app/(dashboard)/leads/[id]/lead-detail-client.tsx
git commit -m "feat: wire EditLeadModal and ScoringTestPanel into lead detail page"
```

---

## Task 12: Build verification

**Files:** none — verification only

- [ ] **Step 1: Run full production build**

```
npm run build
```
Expected: completes with no errors. Any TypeScript or import errors surface here.

- [ ] **Step 2: Start dev server and verify manually**

```
npm run dev
```

Open a lead detail page and verify:
- Status area shows a colored badge, no dropdown
- `⋯` button opens the edit modal with pre-filled fields
- Edit modal saves and page refreshes with updated data
- "Marcar como Cerrado" shows inline confirm on first click, saves on second, badge updates
- "Marcar como Perdido" same flow
- After marking closed/lost: temperature card shows "Score congelado", Proceso de Compra shows overlay
- Agent card has no "Ver Calendly" button
- "Iniciar proceso" modal writes to DB, status transitions to En Proceso
- "Marcar como Completado" transitions to Proceso Completado
- Activity timeline shows "Sin actividad registrada todavía" if no events, or real events with correct icons
- Scoring test panel is visible between the grid and timeline
- Checking scoring events and saving writes to `lead_events` and updates score + status badge
- Scoring test panel shows disabled overlay for frozen-status leads
- Points badges appear in the timeline for events that have points

- [ ] **Step 3: Final commit**

```
git add .
git commit -m "feat: lead detail page overhaul — status, edit, scoring test panel, real timeline"
```
