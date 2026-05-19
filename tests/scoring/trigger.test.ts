/**
 * Integration tests for the lead_events scoring trigger (migration 010).
 *
 * Each test inserts a lead event via adminClient and verifies the side-effects:
 * - peak_score / current_score updated on leads
 * - status band transitions written to lead_status_history
 * - notifications fired on ≥80 rising edge
 * - dedup guard rejects duplicate dedup_key
 * - frozen leads (process_started etc.) are not scored
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

// A fresh lead created for each test (to start with a clean score slate)
const SCORING_LEAD_ID = 'lead-scoring-test-01'

async function freshLead(overrides: Record<string, unknown> = {}) {
  await adminClient.from('leads').delete().eq('id', SCORING_LEAD_ID)
  await adminClient.from('lead_status_history').delete().eq('lead_id', SCORING_LEAD_ID)
  await adminClient.from('notifications').delete().eq('lead_id', SCORING_LEAD_ID)
  await adminClient.from('lead_events').delete().eq('lead_id', SCORING_LEAD_ID)

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
    peak_score: 0,
    current_score: 0,
    ...overrides,
  })
  if (error) throw new Error(`freshLead insert failed: ${error.message}`)
}

async function insertEvent(type: string, dedup_key?: string) {
  const payload: Record<string, unknown> = {
    lead_id: SCORING_LEAD_ID,
    tenant_id: TENANT_A_ID,
    type,
    description: `test: ${type}`,
  }
  if (dedup_key) payload.dedup_key = dedup_key
  return adminClient.from('lead_events').insert(payload)
}

async function getLead() {
  const { data } = await adminClient
    .from('leads')
    .select('peak_score, current_score, status, last_event_at')
    .eq('id', SCORING_LEAD_ID)
    .single()
  return data
}

describe('Scoring trigger: lead_events', () => {
  beforeAll(async () => {
    await createFixtures()
    await freshLead()
  })

  afterAll(async () => {
    await adminClient.from('lead_events').delete().eq('lead_id', SCORING_LEAD_ID)
    await adminClient.from('notifications').delete().eq('lead_id', SCORING_LEAD_ID)
    await adminClient.from('lead_status_history').delete().eq('lead_id', SCORING_LEAD_ID)
    await adminClient.from('leads').delete().eq('id', SCORING_LEAD_ID)
    await cleanupFixtures()
  })

  it('email_clicked (+15) raises score and promotes to nurturing', async () => {
    await freshLead({ peak_score: 0, current_score: 0, status: 'new' })
    const { error } = await insertEvent('email_clicked')
    expect(error).toBeNull()

    const lead = await getLead()
    expect(lead!.peak_score).toBe(15)
    expect(lead!.current_score).toBe(15)
    expect(lead!.status).toBe('nurturing')
  })

  it('writes lead_status_history on band transition', async () => {
    const { data } = await adminClient
      .from('lead_status_history')
      .select('from_status, to_status, source')
      .eq('lead_id', SCORING_LEAD_ID)
      .order('changed_at', { ascending: false })
      .limit(1)
    expect(data).toHaveLength(1)
    expect(data![0].from_status).toBe('new')
    expect(data![0].to_status).toBe('nurturing')
    expect(data![0].source).toBe('trigger')
  })

  it('property_inquiry (+30) raises score to warm', async () => {
    // current score is 15 (nurturing), +30 = 45 → warm
    const { error } = await insertEvent('property_inquiry')
    expect(error).toBeNull()
    const lead = await getLead()
    expect(lead!.peak_score).toBe(45)
    expect(lead!.status).toBe('warm')
  })

  it('consultation_scheduled (+50) raises score to hot and fires ≥80 notification', async () => {
    // current score is 45, +50 = 95 → hot, crosses ≥80 rising edge
    const { error } = await insertEvent('consultation_scheduled', 'consult-dedup-01')
    expect(error).toBeNull()

    const lead = await getLead()
    expect(lead!.peak_score).toBe(95)
    expect(lead!.status).toBe('hot')

    // Notification must have been fired
    const { data: notifs } = await adminClient
      .from('notifications')
      .select('type, message')
      .eq('lead_id', SCORING_LEAD_ID)
      .eq('type', 'score_threshold')
    expect(notifs).toHaveLength(1)
    expect(notifs![0].message).toContain('95')
  })

  it('second high-score event does NOT fire a second ≥80 notification (rising edge only)', async () => {
    // score is already ≥80; another positive event should not double-notify
    await insertEvent('email_clicked')
    const { data: notifs } = await adminClient
      .from('notifications')
      .select('id')
      .eq('lead_id', SCORING_LEAD_ID)
      .eq('type', 'score_threshold')
    // Still exactly 1 notification
    expect(notifs).toHaveLength(1)
  })

  it('dedup guard rejects a duplicate dedup_key', async () => {
    // Insert the same dedup_key twice — second must error
    await insertEvent('email_clicked', 'dedup-key-unique-01')
    const { error } = await insertEvent('email_clicked', 'dedup-key-unique-01')
    expect(error).not.toBeNull()
  })

  it('events without a matching rule update last_event_at but do not change score', async () => {
    const before = await getLead()
    await insertEvent('unknown_event_type_xyz')
    const after = await getLead()
    expect(after!.peak_score).toBe(before!.peak_score)
    expect(after!.last_event_at).not.toBeNull()
  })

  it('email_spam_complaint (-100, force_perdido) sets status to lost', async () => {
    await freshLead({ peak_score: 50, current_score: 50, status: 'warm' })
    const { error } = await insertEvent('email_spam_complaint')
    expect(error).toBeNull()
    const lead = await getLead()
    expect(lead!.status).toBe('lost')
    // Score should be capped at 0 (50 - 100 = -50, clamped)
    expect(lead!.peak_score).toBe(0)
  })

  it('frozen lead (process_started) is not scored', async () => {
    await freshLead({ peak_score: 60, current_score: 60, status: 'process_started' })
    await insertEvent('email_clicked')
    const lead = await getLead()
    // Score must remain unchanged
    expect(lead!.peak_score).toBe(60)
    expect(lead!.status).toBe('process_started')
  })

  it('recalc_lead_score returns same score when event was recent (≤14 days)', async () => {
    await freshLead({ peak_score: 55, current_score: 55, status: 'warm' })
    // Insert an event to set last_event_at to now
    await insertEvent('page_visit')
    const before = await getLead()

    await adminClient.rpc('recalc_lead_score', { p_lead_id: SCORING_LEAD_ID })
    const after = await getLead()

    // current_score should equal peak_score (within 14-day grace window)
    expect(after!.current_score).toBe(after!.peak_score)
    expect(after!.peak_score).toBe(before!.peak_score)
  })
})
