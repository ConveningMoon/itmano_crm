'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import type { LeadStatus } from '@/lib/types'

const TENANT_ID = 'tenant-aj'

// ─── Constants ────────────────────────────────────────────────────────────────

const FROZEN_STATUSES: LeadStatus[] = ['process_started', 'process_completed', 'closed', 'lost']

// ─── Score band helper ────────────────────────────────────────────────────────

function scoreToBand(score: number): Extract<LeadStatus, 'new' | 'nurturing' | 'warm' | 'hot'> {
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

  if (status === 'process_completed') {
    await supabase.from('lead_events').insert({
      lead_id:     leadId,
      tenant_id:   TENANT_ID,
      type:        'status_changed',
      description: 'Proceso de compra completado.',
      points:      0,
    })
  }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/dashboard')
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

  // TODO: move frozen-status guard into the UPDATE WHERE clause for atomicity
  if (FROZEN_STATUSES.includes(lead.status as LeadStatus)) { // reason: Supabase client returns untyped row without generated schema
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
  const current    = (lead.temperature_score as number | null) ?? 0 // reason: Supabase client returns untyped row without generated schema
  const newScore   = Math.min(100, Math.max(0, current + pointsSum))
  const newStatus  = scoreToBand(newScore)

  const { error: updateErr } = await supabase
    .from('leads')
    .update({ temperature_score: newScore, status: newStatus })
    .eq('id', leadId)

  if (updateErr) return { ok: false, error: updateErr.message }

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/dashboard')
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

  await supabase.from('lead_events').insert({
    lead_id:     leadId,
    tenant_id:   TENANT_ID,
    type:        'status_changed',
    description: 'Proceso de compra iniciado.',
    points:      0,
  })

  revalidatePath(`/leads/${leadId}`)
  revalidatePath('/leads')
  revalidatePath('/dashboard')
  return { ok: true }
}
