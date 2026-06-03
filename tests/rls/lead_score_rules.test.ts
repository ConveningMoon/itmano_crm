import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  createFixtures,
  cleanupFixtures,
} from './setup'

// Per-tenant override rules inserted for isolation testing
const RULE_A_UUID = '00000000-0000-0000-0000-000000000a04'
const RULE_B_UUID = '00000000-0000-0000-0000-000000000b04'

describe('RLS: lead_score_rules', () => {
  beforeAll(async () => {
    await createFixtures()
    // Insert per-tenant override rules so we can test cross-tenant isolation.
    // Global rules (tenant_id = null) are already seeded by migration 009.
    await adminClient.from('lead_score_rules').upsert(
      [
        {
          id: RULE_A_UUID,
          tenant_id: TENANT_A_ID,
          category: 'engagement',
          dimension: 'rls_test_event',
          event_type: 'rls_test_event',
          points: 99,
        },
        {
          id: RULE_B_UUID,
          tenant_id: TENANT_B_ID,
          category: 'engagement',
          dimension: 'rls_test_event',
          event_type: 'rls_test_event',
          points: 88,
        },
      ],
      { onConflict: 'id' }
    )
  })

  afterAll(async () => {
    await adminClient
      .from('lead_score_rules')
      .delete()
      .in('id', [RULE_A_UUID, RULE_B_UUID])
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
})
