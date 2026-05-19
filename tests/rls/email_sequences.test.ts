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

describe('RLS: email_sequences', () => {
  beforeAll(async () => {
    await createFixtures()
  })
  afterAll(async () => {
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A sequences', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('email_sequences')
      .select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === SEQ_A_UUID)).toBe(true)
  })

  it('tenant A user cannot see tenant B sequences', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('email_sequences')
      .select('id')
      .eq('id', SEQ_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert sequence for tenant B', async () => {
    // email_sequences.acquisition_channel_id is UNIQUE — use a non-existent channel
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('email_sequences').insert({
      tenant_id: TENANT_B_ID,
      acquisition_channel_id: '00000000-0000-0000-0000-000000000000',
      name: 'Attempt Seq',
    })
    expect(error).not.toBeNull()
  })

  it('tenant A user cannot update tenant B sequences', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('email_sequences')
      .update({ name: 'Hacked' })
      .eq('id', SEQ_B_UUID)
      .select()
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot delete tenant B sequences', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('email_sequences')
      .delete()
      .eq('id', SEQ_B_UUID)
      .select()
    expect(data).toHaveLength(0)
    const { data: check } = await adminClient
      .from('email_sequences')
      .select('id')
      .eq('id', SEQ_B_UUID)
    expect(check).toHaveLength(1)
  })

  it('super admin sees sequences from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('email_sequences')
      .select('id')
      .in('id', [SEQ_A_UUID, SEQ_B_UUID])
    expect(data).toHaveLength(2)
  })
})
