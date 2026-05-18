import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  LEAD_A_ID,
  LEAD_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  createFixtures,
  cleanupFixtures,
} from './setup'

const HIST_A_UUID = '00000000-0000-0000-0000-000000000a05'
const HIST_B_UUID = '00000000-0000-0000-0000-000000000b05'

describe('RLS: lead_status_history', () => {
  beforeAll(async () => {
    await createFixtures()
    await adminClient.from('lead_status_history').upsert(
      [
        {
          id: HIST_A_UUID,
          lead_id: LEAD_A_ID,
          tenant_id: TENANT_A_ID,
          from_status: null,
          to_status: 'nurturing',
          source: 'system',
        },
        {
          id: HIST_B_UUID,
          lead_id: LEAD_B_ID,
          tenant_id: TENANT_B_ID,
          from_status: null,
          to_status: 'nurturing',
          source: 'system',
        },
      ],
      { onConflict: 'id' }
    )
  })

  afterAll(async () => {
    await adminClient
      .from('lead_status_history')
      .delete()
      .in('id', [HIST_A_UUID, HIST_B_UUID])
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A history rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('lead_status_history')
      .select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === HIST_A_UUID)).toBe(true)
  })

  it('tenant A user cannot see tenant B history rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_status_history')
      .select('id')
      .eq('id', HIST_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert history for tenant B lead', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('lead_status_history').insert({
      lead_id: LEAD_B_ID,
      tenant_id: TENANT_B_ID,
      to_status: 'caliente',
      source: 'system',
    })
    expect(error).not.toBeNull()
  })

  it('tenant A user cannot update tenant B history rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_status_history')
      .update({ to_status: 'hacked' })
      .eq('id', HIST_B_UUID)
      .select('id')
    expect(data).toHaveLength(0)
  })

  it('super admin sees history from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('lead_status_history')
      .select('id')
      .in('id', [HIST_A_UUID, HIST_B_UUID])
    expect(data).toHaveLength(2)
  })
})
