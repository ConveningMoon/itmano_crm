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

// UUIDs for the per-test fixture rows
const CPV_A_UUID = '00000000-0000-0000-0000-00000000ca01'
const CPV_B_UUID = '00000000-0000-0000-0000-00000000cb01'

describe('RLS: channel_page_views', () => {
  beforeAll(async () => {
    await createFixtures()
    // Insert per-test fixture rows via admin
    await adminClient.from('channel_page_views').upsert(
      [
        {
          id: CPV_A_UUID,
          tenant_id: TENANT_A_ID,
          channel_id: CHANNEL_A_UUID,
          visitor_fingerprint: 'fp-rls-test-a',
          utm_data: {},
        },
        {
          id: CPV_B_UUID,
          tenant_id: TENANT_B_ID,
          channel_id: CHANNEL_B_UUID,
          visitor_fingerprint: 'fp-rls-test-b',
          utm_data: {},
        },
      ],
      { onConflict: 'id' }
    )
  })

  afterAll(async () => {
    await adminClient
      .from('channel_page_views')
      .delete()
      .in('id', [CPV_A_UUID, CPV_B_UUID])
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A page views', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('channel_page_views')
      .select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === CPV_A_UUID)).toBe(true)
  })

  it('tenant A user cannot see tenant B page views', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('channel_page_views')
      .select('id')
      .eq('id', CPV_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert page view for tenant B', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('channel_page_views').insert({
      tenant_id: TENANT_B_ID,
      channel_id: CHANNEL_B_UUID,
      visitor_fingerprint: 'fp-rls-attempt',
      utm_data: {},
    })
    expect(error).not.toBeNull()
  })

  it('tenant A user cannot delete tenant B page views', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('channel_page_views')
      .delete()
      .eq('id', CPV_B_UUID)
      .select()
    expect(data).toHaveLength(0)
    const { data: check } = await adminClient
      .from('channel_page_views')
      .select('id')
      .eq('id', CPV_B_UUID)
    expect(check).toHaveLength(1)
  })

  it('super admin sees page views from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('channel_page_views')
      .select('id')
      .in('id', [CPV_A_UUID, CPV_B_UUID])
    expect(data).toHaveLength(2)
  })
})
