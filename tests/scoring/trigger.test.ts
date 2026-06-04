/**
 * Integration tests for the three-component scoring engine (migration 029).
 *
 * total = clamp(0,100, fit + engagement_decayed + manual)
 *   - fit: from leads.fit_profile (latest-wins, no decay)
 *   - engagement: events; positive decays by per-event age, negative persists
 *   - manual: events, no decay
 * Status bands + hot_lead ≥80 rising edge + freeze are preserved.
 * The lead_events AFTER INSERT trigger and recompute_lead_score share one code path.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  TENANT_A_ID,
  AGENT_A_ID,
  CHANNEL_A_UUID,
  createFixtures,
  cleanupFixtures,
} from '../rls/setup'

const SCORING_LEAD_ID = 'lead-scoring-test-01'

async function freshLead(overrides: Record<string, unknown> = {}) {
  await adminClient.from('lead_events').delete().eq('lead_id', SCORING_LEAD_ID)
  await adminClient.from('lead_status_history').delete().eq('lead_id', SCORING_LEAD_ID)
  await adminClient.from('notifications').delete().eq('lead_id', SCORING_LEAD_ID)
  await adminClient.from('leads').delete().eq('id', SCORING_LEAD_ID)

  const { error } = await adminClient.from('leads').insert({
    id: SCORING_LEAD_ID,
    tenant_id: TENANT_A_ID,
    agent_id: AGENT_A_ID,
    acquisition_channel_id: CHANNEL_A_UUID,
    first_name: 'Score',
    last_name: 'TestLead',
    email: 'score-test@test.invalid',
    language: 'es',
    status: 'new',
    current_score: 0,
    peak_score: 0,
    fit_profile: {},
    ...overrides,
  })
  if (error) throw new Error(`freshLead insert failed: ${error.message}`)
}

async function insertEvent(type: string, opts: { dedup_key?: string; created_at?: string } = {}) {
  const payload: Record<string, unknown> = {
    lead_id: SCORING_LEAD_ID,
    tenant_id: TENANT_A_ID,
    type,
    description: `test: ${type}`,
  }
  if (opts.dedup_key) payload.dedup_key = opts.dedup_key
  if (opts.created_at) payload.created_at = opts.created_at
  return adminClient.from('lead_events').insert(payload)
}

async function recompute() {
  return adminClient.rpc('recompute_lead_score', { p_lead_id: SCORING_LEAD_ID })
}

async function getLead() {
  const { data } = await adminClient
    .from('leads')
    .select('fit_score, engagement_score, manual_score, current_score, peak_score, status, last_event_at')
    .eq('id', SCORING_LEAD_ID)
    .single()
  return data!
}

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
}

describe('Scoring engine: three components', () => {
  beforeAll(async () => {
    await createFixtures()
  })
  afterAll(async () => {
    await adminClient.from('lead_events').delete().eq('lead_id', SCORING_LEAD_ID)
    await adminClient.from('notifications').delete().eq('lead_id', SCORING_LEAD_ID)
    await adminClient.from('lead_status_history').delete().eq('lead_id', SCORING_LEAD_ID)
    await adminClient.from('leads').delete().eq('id', SCORING_LEAD_ID)
    await cleanupFixtures()
  })

  it('fit comes from fit_profile (latest-wins, no double count)', async () => {
    await freshLead({ fit_profile: { financing: 'cash' } })
    await recompute()
    const lead = await getLead()
    expect(lead.fit_score).toBe(25)        // cash, counted once (not 50)
    expect(lead.current_score).toBe(25)
    expect(lead.status).toBe('nurturing')
  })

  it('engagement event promotes via trigger and writes status_history (source trigger)', async () => {
    await freshLead()
    const { error } = await insertEvent('contact_us_question')   // +20 engagement
    expect(error).toBeNull()
    const lead = await getLead()
    expect(lead.engagement_score).toBe(20)
    expect(lead.current_score).toBe(20)
    expect(lead.status).toBe('nurturing')

    const { data } = await adminClient
      .from('lead_status_history')
      .select('from_status, to_status, source')
      .eq('lead_id', SCORING_LEAD_ID)
      .order('changed_at', { ascending: false })
      .limit(1)
    expect(data![0].from_status).toBe('new')
    expect(data![0].to_status).toBe('nurturing')
    expect(data![0].source).toBe('trigger')
  })

  it('engagement accumulates across events', async () => {
    await insertEvent('email_clicked')   // +10 → 30
    const lead = await getLead()
    expect(lead.engagement_score).toBe(30)
    expect(lead.current_score).toBe(30)
  })

  it('positive engagement decays by event age (44d → half)', async () => {
    await freshLead()
    await insertEvent('email_clicked', { created_at: daysAgo(44) })  // 10 × 0.5 = 5
    const lead = await getLead()
    expect(lead.engagement_score).toBe(5)
    expect(lead.current_score).toBe(5)
  })

  it('negative engagement does NOT decay (persists full)', async () => {
    // fit 45 (cash 25 + premium 20); aged hard bounce -30 full → 15 (would be 30 if decayed)
    await freshLead({ fit_profile: { financing: 'cash', budget_tier: 'premium' } })
    await insertEvent('email_hard_bounce', { created_at: daysAgo(44) })
    const lead = await getLead()
    expect(lead.fit_score).toBe(45)
    expect(lead.engagement_score).toBe(-30)
    expect(lead.current_score).toBe(15)
  })

  it('manual events accumulate and do not decay', async () => {
    await freshLead()
    await insertEvent('appointment_scheduled', { created_at: daysAgo(44) })  // +15, no decay
    const lead = await getLead()
    expect(lead.manual_score).toBe(15)
    expect(lead.current_score).toBe(15)
  })

  it('fires hot_lead on ≥80 rising edge, only once', async () => {
    await freshLead({
      fit_profile: { financing: 'cash', timeline: 'under_3_months', budget_tier: 'premium', agent_status: 'sin_agente' },
    })
    await recompute()   // fit 80
    let lead = await getLead()
    expect(lead.current_score).toBe(80)
    expect(lead.status).toBe('hot')

    await recompute()   // second pass — must not double-notify
    lead = await getLead()
    expect(lead.current_score).toBe(80)

    const { data: notifs } = await adminClient
      .from('notifications')
      .select('id, message')
      .eq('lead_id', SCORING_LEAD_ID)
      .eq('type', 'hot_lead')
    expect(notifs).toHaveLength(1)
    expect(notifs![0].message).toContain('80')
  })

  it('peak_score is a high-water mark (kept above a later lower score)', async () => {
    // currently hot at 80; add a negative event to drop current — peak stays 80
    await insertEvent('email_unsubscribed')   // -40 engagement → 80+(-40 eng) ... fit 80 + eng -40 = 40
    const lead = await getLead()
    expect(lead.current_score).toBe(40)
    expect(lead.peak_score).toBe(80)
  })

  it('manual_disqualify forces score 0 / status lost', async () => {
    await freshLead({ fit_profile: { financing: 'cash' } })
    await insertEvent('manual_disqualify')
    const lead = await getLead()
    expect(lead.current_score).toBe(0)
    expect(lead.status).toBe('lost')
  })

  it('email_spam_complaint forces score 0 / status lost', async () => {
    await freshLead({ fit_profile: { financing: 'cash', budget_tier: 'premium' } })
    await insertEvent('email_spam_complaint')
    const lead = await getLead()
    expect(lead.current_score).toBe(0)
    expect(lead.status).toBe('lost')
  })

  it('dedup guard rejects a duplicate dedup_key', async () => {
    await freshLead()
    await insertEvent('email_clicked', { dedup_key: 'dedup-unique-01' })
    const { error } = await insertEvent('email_clicked', { dedup_key: 'dedup-unique-01' })
    expect(error).not.toBeNull()
  })

  it('frozen lead (process_started) is not scored', async () => {
    await freshLead({ status: 'process_started', current_score: 60, peak_score: 60 })
    await insertEvent('contact_us_question')
    const lead = await getLead()
    expect(lead.current_score).toBe(60)
    expect(lead.status).toBe('process_started')
  })

  it('event without a matching rule is a no-op for score', async () => {
    await freshLead({ fit_profile: { financing: 'cash' } })   // fit 25
    await insertEvent('unknown_event_type_xyz')
    const lead = await getLead()
    expect(lead.current_score).toBe(25)        // only fit counts
    expect(lead.engagement_score).toBe(0)
    expect(lead.last_event_at).not.toBeNull()
  })

  // Entry signals (migration 030): event_submission is engagement +20; combined with
  // the form_baseline (+10) emitted on a lead's first form, an event/contact lead is
  // born at 30 from engagement-by-action (no per-channel baseline).
  it('event_submission scores +20 (engagement)', async () => {
    await freshLead()
    await insertEvent('event_submission')
    const lead = await getLead()
    expect(lead.engagement_score).toBe(20)
    expect(lead.current_score).toBe(20)
    expect(lead.status).toBe('nurturing')
  })

  it('form_baseline + event_submission = 30 (no fit)', async () => {
    await freshLead()
    await insertEvent('form_baseline', { dedup_key: 'form_baseline' })  // +10
    await insertEvent('event_submission')                               // +20
    const lead = await getLead()
    expect(lead.engagement_score).toBe(30)
    expect(lead.current_score).toBe(30)
    expect(lead.status).toBe('nurturing')
  })
})
