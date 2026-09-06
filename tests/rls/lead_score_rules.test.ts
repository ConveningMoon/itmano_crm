import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  SUPER_ADMIN_EMAIL,
  TEST_PASSWORD,
  createFixtures,
  cleanupFixtures,
} from './setup'

// Per-tenant override rules inserted for isolation testing
const RULE_A_UUID = '00000000-0000-0000-0000-000000000a04'
const RULE_B_UUID = '00000000-0000-0000-0000-000000000b04'
// Throwaway GLOBAL rule (tenant_id = null) for the update-auth tests. A dedicated
// rule keeps the real seed rules untouched.
const RULE_GLOBAL_UUID = '00000000-0000-0000-0000-000000000c05'

describe('RLS: lead_score_rules', () => {
  beforeAll(async () => {
    await createFixtures()
    // Insert per-tenant override rules so we can test cross-tenant isolation.
    // Global rules (tenant_id = null) are already seeded by migration 009.
    const { error: seedErr } = await adminClient.from('lead_score_rules').upsert(
      [
        {
          id: RULE_A_UUID,
          tenant_id: TENANT_A_ID,
          category: 'engagement',
          dimension: 'rls_test_event',
          event_type: 'rls_test_event',
          points: 99,
          // is_active must be set on every row of a batch upsert: supabase-js sends the
          // union of all rows' keys, filling omitted keys with NULL (not the column
          // default), which would violate the NOT NULL constraint.
          is_active: true,
        },
        {
          id: RULE_B_UUID,
          tenant_id: TENANT_B_ID,
          category: 'engagement',
          dimension: 'rls_test_event',
          event_type: 'rls_test_event',
          points: 88,
          is_active: true,
        },
        {
          id: RULE_GLOBAL_UUID,
          tenant_id: null,
          category: 'engagement',
          dimension: 'rls_test_global_update',
          event_type: 'rls_test_global_update',
          points: 5,
          is_active: true,
        },
      ],
      { onConflict: 'id' }
    )
    if (seedErr) throw new Error(`lead_score_rules fixture upsert failed: ${seedErr.message}`)
  })

  afterAll(async () => {
    await adminClient
      .from('lead_score_rules')
      .delete()
      .in('id', [RULE_A_UUID, RULE_B_UUID, RULE_GLOBAL_UUID])
    await cleanupFixtures()
  })

  it('tenant A user can read global rules (tenant_id = null)', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('lead_score_rules')
      .select('id, tenant_id')
      .is('tenant_id', null)
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.length).toBeGreaterThan(0)
    expect(data!.every((r) => r.tenant_id === null)).toBe(true)
  })

  it('tenant A user can read their own override rules', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('lead_score_rules')
      .select('id')
      .eq('id', RULE_A_UUID)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('tenant A user cannot read tenant B override rules', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_score_rules')
      .select('id')
      .eq('id', RULE_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert a rule', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('lead_score_rules').insert({
      tenant_id: TENANT_A_ID,
      category: 'engagement',
      dimension: 'unauthorized_event',
      event_type: 'unauthorized_event',
      points: 1,
    })
    expect(error).not.toBeNull()
  })

  it('super admin sees all rules including both tenant overrides', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('lead_score_rules')
      .select('id')
      .in('id', [RULE_A_UUID, RULE_B_UUID])
    expect(data).toHaveLength(2)
  })

  it('super admin can insert a rule', async () => {
    const insertId = '00000000-0000-0000-0000-000000000c04'
    const { error } = await adminClient.from('lead_score_rules').insert({
      id: insertId,
      tenant_id: null,
      category: 'engagement',
      dimension: 'rls_test_global_write',
      event_type: 'rls_test_global_write',
      points: 5,
    })
    expect(error).toBeNull()
    await adminClient.from('lead_score_rules').delete().eq('id', insertId)
  })

  // ── Update auth: only super_admin may edit GLOBAL rules (Settings → Scoring) ──

  it('tenant A user (agent_owner) cannot update a global rule', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    // RLS makes this affect 0 rows (no error); confirm the value did not change.
    await client.from('lead_score_rules').update({ points: 77 }).eq('id', RULE_GLOBAL_UUID)

    const { data } = await adminClient
      .from('lead_score_rules')
      .select('points')
      .eq('id', RULE_GLOBAL_UUID)
      .single()
    expect(data!.points).toBe(5)
  })

  it('super admin can update a global rule', async () => {
    const client = await asUser(SUPER_ADMIN_EMAIL, TEST_PASSWORD)
    const { error } = await client
      .from('lead_score_rules')
      .update({ points: 9, is_active: false })
      .eq('id', RULE_GLOBAL_UUID)
    expect(error).toBeNull()

    const { data } = await adminClient
      .from('lead_score_rules')
      .select('points, is_active')
      .eq('id', RULE_GLOBAL_UUID)
      .single()
    expect(data!.points).toBe(9)
    expect(data!.is_active).toBe(false)
  })
})
