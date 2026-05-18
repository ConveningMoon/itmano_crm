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

const NOTIF_A_UUID = '00000000-0000-0000-0000-000000000a06'
const NOTIF_B_UUID = '00000000-0000-0000-0000-000000000b06'

describe('RLS: notifications', () => {
  beforeAll(async () => {
    await createFixtures()
    await adminClient.from('notifications').upsert(
      [
        {
          id: NOTIF_A_UUID,
          tenant_id: TENANT_A_ID,
          type: 'score_threshold',
          lead_id: LEAD_A_ID,
          message: 'Lead A reached score 80',
        },
        {
          id: NOTIF_B_UUID,
          tenant_id: TENANT_B_ID,
          type: 'score_threshold',
          lead_id: LEAD_B_ID,
          message: 'Lead B reached score 80',
        },
      ],
      { onConflict: 'id' }
    )
  })

  afterAll(async () => {
    await adminClient
      .from('notifications')
      .delete()
      .in('id', [NOTIF_A_UUID, NOTIF_B_UUID])
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A notifications', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('notifications')
      .select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === NOTIF_A_UUID)).toBe(true)
  })

  it('tenant A user cannot see tenant B notifications', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('notifications')
      .select('id')
      .eq('id', NOTIF_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert a notification for tenant B', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('notifications').insert({
      tenant_id: TENANT_B_ID,
      type: 'score_threshold',
      message: 'Hacked notification',
    })
    expect(error).not.toBeNull()
  })

  it('tenant A user can mark their own notification as read', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('notifications')
      .update({ read: true })
      .eq('id', NOTIF_A_UUID)
      .select('id, read')
    expect(data).toHaveLength(1)
    expect(data![0].read).toBe(true)
    // Reset
    await adminClient.from('notifications').update({ read: false }).eq('id', NOTIF_A_UUID)
  })

  it('tenant A user cannot update tenant B notifications', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('notifications')
      .update({ read: true })
      .eq('id', NOTIF_B_UUID)
      .select('id')
    expect(data).toHaveLength(0)
  })

  it('super admin sees notifications from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('notifications')
      .select('id')
      .in('id', [NOTIF_A_UUID, NOTIF_B_UUID])
    expect(data).toHaveLength(2)
  })
})
