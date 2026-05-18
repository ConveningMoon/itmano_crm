import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  SEQ_A_UUID,
  SEQ_B_UUID,
  createFixtures,
  cleanupFixtures,
} from './setup'

// UUIDs for per-test fixture rows (email_sequence_steps.id is uuid auto-generated,
// but we supply static ones for predictable cleanup)
const STEP_A_UUID = '00000000-0000-0000-0000-00000000sa01'
const STEP_B_UUID = '00000000-0000-0000-0000-00000000sb01'

describe('RLS: email_sequence_steps', () => {
  beforeAll(async () => {
    await createFixtures()
    await adminClient.from('email_sequence_steps').upsert(
      [
        {
          id: STEP_A_UUID,
          sequence_id: SEQ_A_UUID,
          tenant_id: TENANT_A_ID,
          step_order: 1,
          delay_hours: 0,
          subject: 'RLS Test Step A',
          body_html: '<p>Step A</p>',
        },
        {
          id: STEP_B_UUID,
          sequence_id: SEQ_B_UUID,
          tenant_id: TENANT_B_ID,
          step_order: 1,
          delay_hours: 0,
          subject: 'RLS Test Step B',
          body_html: '<p>Step B</p>',
        },
      ],
      { onConflict: 'id' }
    )
  })

  afterAll(async () => {
    await adminClient
      .from('email_sequence_steps')
      .delete()
      .in('id', [STEP_A_UUID, STEP_B_UUID])
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A steps', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('email_sequence_steps')
      .select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === STEP_A_UUID)).toBe(true)
  })

  it('tenant A user cannot see tenant B steps', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('email_sequence_steps')
      .select('id')
      .eq('id', STEP_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert steps for tenant B sequence', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('email_sequence_steps').insert({
      sequence_id: SEQ_B_UUID,
      tenant_id: TENANT_B_ID,
      step_order: 99,
      delay_hours: 0,
      subject: 'Hacker Step',
      body_html: '<p>Hacked</p>',
    })
    expect(error).not.toBeNull()
    await adminClient
      .from('email_sequence_steps')
      .delete()
      .eq('sequence_id', SEQ_B_UUID)
      .eq('step_order', 99)
  })

  it('tenant A user cannot update tenant B steps', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('email_sequence_steps')
      .update({ subject: 'Hacked' })
      .eq('id', STEP_B_UUID)
      .select()
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot delete tenant B steps', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('email_sequence_steps')
      .delete()
      .eq('id', STEP_B_UUID)
      .select()
    expect(data).toHaveLength(0)
    const { data: check } = await adminClient
      .from('email_sequence_steps')
      .select('id')
      .eq('id', STEP_B_UUID)
    expect(check).toHaveLength(1)
  })

  it('super admin sees steps from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('email_sequence_steps')
      .select('id')
      .in('id', [STEP_A_UUID, STEP_B_UUID])
    expect(data).toHaveLength(2)
  })
})
