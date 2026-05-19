import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  CHANNEL_A_UUID,
  CHANNEL_B_UUID,
  createFixtures,
  cleanupFixtures,
} from './setup'

describe('RLS: acquisition_channels', () => {
  beforeAll(async () => {
    await createFixtures()
  })
  afterAll(async () => {
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('acquisition_channels')
      .select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === CHANNEL_A_UUID)).toBe(true)
  })

  it('tenant A user cannot see tenant B rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('acquisition_channels')
      .select('id')
      .eq('id', CHANNEL_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert a row with tenant B id', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('acquisition_channels').insert({
      tenant_id: TENANT_B_ID,
      public_id: 'chn_rlsattempt01',
      channel_type: 'manual',
      name: 'Attempt',
      slug: 'rls-attempt-chn',
    })
    expect(error).not.toBeNull()
    // Cleanup any accidental insert (shouldn't exist due to RLS)
    await adminClient
      .from('acquisition_channels')
      .delete()
      .eq('public_id', 'chn_rlsattempt01')
  })

  it('tenant A user cannot update tenant B rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('acquisition_channels')
      .update({ name: 'Hacked' })
      .eq('id', CHANNEL_B_UUID)
      .select()
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot delete tenant B rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('acquisition_channels')
      .delete()
      .eq('id', CHANNEL_B_UUID)
      .select()
    expect(data).toHaveLength(0)
    // Verify it still exists via admin
    const { data: check } = await adminClient
      .from('acquisition_channels')
      .select('id')
      .eq('id', CHANNEL_B_UUID)
    expect(check).toHaveLength(1)
  })

  it('super admin sees rows from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('acquisition_channels')
      .select('id')
      .in('id', [CHANNEL_A_UUID, CHANNEL_B_UUID])
    expect(data).toHaveLength(2)
  })
})
