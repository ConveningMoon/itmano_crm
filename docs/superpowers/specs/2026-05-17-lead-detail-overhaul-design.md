# Lead Detail Page Overhaul — Design Spec
Date: 2026-05-17

## Overview

Overhaul the lead detail page (`/leads/[id]`) to:
- Replace the status dropdown with a read-only badge; add terminal-status action buttons with inline confirmation
- Remove deprecated UI elements ("Marcar como hot", "Ver Calendly")
- Wire all status changes and lead edits to the database via server actions
- Replace mock activity timeline with real `lead_events` data, with points display
- Add a full-profile edit modal behind the `⋯` button
- Add a temporary scoring test panel for QA of the scoring system

---

## Schema Changes — Migration `002_lead_events_points.sql`

```sql
-- Events carry their point delta (nullable — system events like "lead_created" have no points)
ALTER TABLE lead_events ADD COLUMN points integer;

-- Allows NULL score for terminal leads (closed/lost)
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

CREATE POLICY "purchase_processes_all" ON purchase_processes
  USING (is_super_admin() OR tenant_id = get_my_tenant_id())
  WITH CHECK (is_super_admin() OR tenant_id = get_my_tenant_id());

CREATE INDEX idx_purchase_processes_lead_id ON purchase_processes(lead_id);
```

**Score NULL behavior — important distinction:**
- `closed` / `lost`: server action sets `temperature_score = NULL` in DB. Score is gone.
- `process_started` / `process_completed`: score numeric value is kept in DB (no Phase 2 `peak_score` backup exists yet to recover from NULL). The UI displays "Score congelado" based on status, not on a NULL check.
- The scoring test panel is disabled for all four frozen statuses.

Score bands (auto-promotion logic):
- 0–14 → `new`
- 15–34 → `nurturing`
- 35–59 → `warm`
- 60+ → `hot`

Score is frozen (no writes) when status is `process_started`, `process_completed`, `closed`, or `lost`.

---

## File Structure

```
src/app/(dashboard)/leads/[id]/
  page.tsx                  — fetch purchase_processes + add `points` to events mapping
  lead-detail-client.tsx    — status badge, confirm buttons, remove deprecated UI, wire modals
  actions.ts                — NEW: all DB mutations for this page
  edit-lead-modal.tsx       — NEW: full-profile edit modal
  scoring-test-panel.tsx    — NEW: scoring test block (temporary QA tool)

supabase/migrations/
  002_lead_events_points.sql — NEW: schema changes above

src/lib/types.ts            — add `points?: number | null` to LeadEvent; add PurchaseProcess type
src/lib/db.ts               — add PurchaseProcessRow type + mapPurchaseProcess mapper
```

---

## Server Actions — `actions.ts`

All actions use `createAdminClient()` and return `{ ok: true } | { ok: false; error: string }`.
All actions call `revalidatePath('/leads/[id]')` on success.

### `updateLeadStatus(leadId: string, status: 'process_completed' | 'closed' | 'lost')`
- Updates `leads.status`
- If status is `closed` or `lost`: also sets `temperature_score = NULL`
- If status is `process_completed`: score value is kept in DB (frozen, not nulled)
- Score-band transitions (`new`/`nurturing`/`warm`/`hot`) happen via `insertScoringEvents`, never this action
- `process_started` is set via `startPurchaseProcess` only

### `updateLead(leadId: string, fields: LeadEditFields)`
- Updates: `first_name`, `last_name`, `email`, `phone`, `language`, `agent_id`, `source_id`, `lender`, `notes`
- Never touches `status` or `temperature_score`

### `insertScoringEvents(leadId: string, tenantId: string, events: ScoringEventInput[])`
- Only runs if lead status is in `['new', 'nurturing', 'warm', 'hot']`
- Inserts one `lead_events` row per event: `{ lead_id, tenant_id, type, description, points }`
- Recalculates score: `LEAST(100, GREATEST(0, current_score + sum_of_points))`
- Auto-promotes status to the correct score band
- Updates `leads.temperature_score` and `leads.status`

### `startPurchaseProcess(leadId: string, tenantId: string, data: ProcessData)`
- Updates `leads.status = 'process_started'`
- Inserts one row into `purchase_processes` with address, loan_type, closing_date, notes
- Score numeric value is kept in DB but treated as frozen (no further writes from scoring panel)
- `ProcessData`: `{ address: string; loanType: string; closingDate: string; notes: string }`

---

## `lead-detail-client.tsx` Changes

### Status area (header, top right)
- **Remove** the `<select>` dropdown
- **Add** a styled badge: `STATUS_CONFIG[currentStatus]` colors, same pill shape as existing badges elsewhere
- The `⋯` (`MoreHorizontal`) button now sets `showEditModal(true)`

### Temperature card
- When `lead.temperatureScore === null` OR status is in `['process_started', 'process_completed', 'closed', 'lost']`:
  replace pills/bar with a single line: `"Score congelado — lead [STATUS_CONFIG[status].label]"`
- When score is a number and status is score-driven: existing pills/bar UI unchanged

### Actions card (right column) — final state

| Button | Behavior |
|---|---|
| Enviar email | Placeholder (unchanged) |
| WhatsApp | Placeholder (unchanged) |
| ~~Marcar como hot~~ | **Removed** |
| Marcar como Cerrado | Inline confirm: text changes to "¿Confirmar cierre?" + "✕ Cancelar". On confirm → `updateLeadStatus(id, 'closed')`. Disabled if status is `closed` or `lost`. |
| Marcar como Perdido | Same inline confirm → `updateLeadStatus(id, 'lost')`. Disabled if status is `closed` or `lost`. |

### Agent card (right column)
- **Remove** the "Ver Calendly" button
- Card shows: avatar + name + specialty + email + phone only

### Proceso de Compra card (left column)
- When `status === 'closed' || status === 'lost'`: entire card body wrapped in `opacity: 0.4, pointerEvents: 'none'` with banner: *"Proceso deshabilitado — lead cerrado."*
- "Iniciar proceso" modal on submit now calls `startPurchaseProcess` server action (not just local state)

---

## `edit-lead-modal.tsx`

Triggered by `⋯` button. Visual style matches existing "Iniciar proceso" modal.

**Editable fields:**

| Label | Field | Input |
|---|---|---|
| Nombre | `firstName` | text |
| Apellido | `lastName` | text |
| Email | `email` | email |
| Teléfono | `phone` | text (optional) |
| Idioma | `language` | select (LANGUAGE_CONFIG) |
| Agente asignado | `agentId` | select (agents prop) |
| Fuente | `sourceId` | select (sources prop) |
| Prestamista | `lender` | text (optional) |
| Notas | `notes` | textarea |

**Props:** `lead`, `agents: Agent[]`, `sources: LeadSource[]`, `isOpen: boolean`, `onClose: () => void`

**Behavior:**
- Pre-populated with current lead values on open
- On submit → `updateLead(leadId, fields)` → on success → `router.refresh()` + `onClose()`
- On error → inline error below form
- "Cancelar" closes without saving

---

## `page.tsx` additions

- Add `purchase_processes` to the parallel fetch:
  ```ts
  supabase.from('purchase_processes').select('*').eq('lead_id', id).maybeSingle()
  ```
- Pass `purchaseProcess` (typed, nullable) as a prop to `LeadDetailClient` so the Proceso de Compra card shows real DB data instead of hardcoded values
- Add `points` to the events mapping:
  ```ts
  points: r.points as number | null
  ```

## Activity Timeline — Real Data

### `src/lib/types.ts`
- Add `points?: number | null` to `LeadEvent`
- Add `PurchaseProcess` interface: `{ id, leadId, tenantId, address, loanType, closingDate, notes, createdAt }`

### `src/lib/db.ts`
- Add `PurchaseProcessRow` type
- Add `mapPurchaseProcess` mapper

### `lead-detail-client.tsx` timeline
- **Remove** `generateMockEvents` entirely
- Always render real DB events
- Empty state: *"Sin actividad registrada todavía."*

**Icon + color mapping by `event.type`:**

| type | Icon | Color |
|---|---|---|
| `lead_created` | UserPlus | `#5B8EC9` |
| `email_opened` | Mail | `#C9A96E` |
| `email_clicked` | MousePointer2 | `#C9A96E` |
| `lm_downloaded` | FileDown | `#5AAFA0` |
| `consultation_scheduled` | Calendar | `#9B72CF` |
| `consultation_attended` | CheckCircle2 | `#6BA368` |
| `reply_received` | MessageCircle | `#5AAFA0` |
| `phone_call` | Phone | `#5B8EC9` |
| `unsubscribed` | XCircle | `#C97B6B` |
| `status_changed` | ArrowRightCircle | `#9B72CF` |
| `score_manual` | Activity | `#C9A96E` |
| *(default)* | Circle | `#C9A96E` |

**Points badge:** When `event.points !== null`:
- Positive: `+N pts` in `#6BA368`
- Negative: `−N pts` in `#C97B6B`
Rendered as a small badge to the right of the event description, before the timestamp.

---

## `scoring-test-panel.tsx`

Full-width card between the two-column grid and the timeline.
Marked as a testing tool with a subtle "SCORING TEST" chip in the card header.

**Props:** `leadId: string`, `tenantId: string`, `currentStatus: LeadStatus`, `currentScore: number | null`

**Disabled state:** When `status` is `process_started`, `process_completed`, `closed`, or `lost`:
- `opacity: 0.5, pointerEvents: 'none'`
- Banner: *"Score congelado — este lead está fuera del funnel activo."*

**Scoring event table (from CLAUDE.md):**

| Category | Event label | type key | Points |
|---|---|---|---|
| Nuclear | Consulta / visita agendada | `consultation_scheduled` | +50 |
| Nuclear | Consulta / visita atendida | `consultation_attended` | +30 |
| Nuclear | Solicitud de valoración AVM | `avm_request` | +40 |
| Nuclear | Consulta sobre propiedad específica | `property_inquiry` | +30 |
| Nuclear | Respuesta a email o WhatsApp | `reply_received` | +30 |
| Nuclear | Llamada atendida (>2 min) | `phone_call` | +25 |
| Medio | Click en CTA de email | `email_clicked` | +15 |
| Medio | 2° lead magnet descargado | `lm_downloaded_2` | +20 |
| Medio | 3°+ lead magnet descargado | `lm_downloaded_3plus` | +25 |
| Medio | Visita a página de servicios/precios | `page_visit_pricing` | +15 |
| Medio | Suscripción al newsletter | `newsletter_subscribed` | +10 |
| Bajo | Email abierto | `email_opened` | +2 |
| Bajo | Visita genérica a página | `page_visit_generic` | +3 |
| Negativo | Desuscripción de email | `unsubscribed` | −50 |
| Negativo | Hard bounce | `hard_bounce` | −30 |
| Negativo | Queja de spam | `spam_complaint` | −100 |
| Negativo | Respuesta de rechazo | `reply_negative` | −40 |

Categories separated by subtle divider + uppercase label.
Each row: checkbox left, event label center, points badge right (green/coral).

**"Guardar" button:**
1. Collects checked events
2. Calls `insertScoringEvents(leadId, tenantId, selectedEvents)`
3. On success → clears checkboxes + `router.refresh()`
4. On error → inline error message

---

## Constraints & Rules Applied

- All DB mutations use `createAdminClient()` (service role, server-only)
- No client-side Supabase calls
- No new route handlers — mutations via Server Actions only
- Score-band status (`new`/`nurturing`/`warm`/`hot`) is never set manually — only derived from score
- `process_started` and `process_completed` are only set via the Proceso de Compra flow
- `closed` and `lost` are only set via the Actions card buttons with inline confirmation
- Scoring test panel is disabled for all frozen-score statuses
- All mutations return typed `{ ok, error }` shapes — no throws to client
