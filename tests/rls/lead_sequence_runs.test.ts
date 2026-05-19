import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  LEAD_A_ID,
  LEAD_B_ID,
  SEQ_A_UUID,
  SEQ_B_UUID,
  createFixtures,
  cleanupFixtures,
} from './setup'

// lead_sequence_runs.id is uuid auto-generated
let runAId: string
let runBId: string

describe('RLS: lead_sequence_runs', () => {
  beforeAll(async () => {
    await createFixtures()

    const { data: insertedA } = await adminClient
      .from('lead_sequence_runs')
      .insert({
        tenant_id: TENANT_A_ID,
        lead_id: LEAD_A_ID,
        sequence_id: SEQ_A_UUID,
        current_step_order: 0,
        status: 'active',
      })
      .select('id')
      .single()
    runAId = insertedA!.id

    const { data: insertedB } = await adminClient
      .from('lead_sequence_runs')
      .insert({
        tenant_id: TENANT_B_ID,
        lead_id: LEAD_B_ID,
        sequence_id: SEQ_B_UUID,
        current_step_order: 0,
        status: 'active',
      })
      .select('id')
      .single()
    runBId = insertedB!.id
  })

  afterAll(async () => {
    if (runAId) {
      await adminClient.from('lead_sequence_runs').delete().eq('id', runAId)
    }
    if (runBId) {
      await adminClient.from('lead_sequence_runs').delete().eq('id', runBId)
    }
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A runs', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('lead_sequence_runs')
      .select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === runAId)).toBe(true)
  })

  it('tenant A user cannot see tenant B runs', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_sequence_runs')
      .select('id')
      .eq('id', runBId)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert run for tenant B', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('lead_sequence_runs').insert({
      tenant_id: TENANT_B_ID,
      lead_id: LEAD_B_ID,
      sequence_id: SEQ_B_UUID,
      current_step_order: 0,
      status: 'active',
    })
    expect(error).not.toBeNull()
  })

  it('tenant A user cannot update tenant B runs', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_sequence_runs')
      .update({ status: 'paused' })
      .eq('id', runBId)
      .select()
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot delete tenant B runs', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_sequence_runs')
      .delete()
      .eq('id', runBId)
      .select()
    expect(data).toHaveLength(0)
    const { data: check } = await adminClient
      .from('lead_sequence_runs')
      .select('id')
      .eq('id', runBId)
    expect(check).toHaveLength(1)
  })

  it('super admin sees runs from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('lead_sequence_runs')
      .select('id')
      .in('id', [runAId, runBId])
    expect(data).toHaveLength(2)
  })
})
