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
  createFixtures,
  cleanupFixtures,
} from './setup'

// lead_events.id is uuid auto-generated; capture the inserted IDs
let eventAId: string
let eventBId: string

describe('RLS: lead_events', () => {
  beforeAll(async () => {
    await createFixtures()
    const { data: insertedA } = await adminClient
      .from('lead_events')
      .insert({
        lead_id: LEAD_A_ID,
        tenant_id: TENANT_A_ID,
        type: 'page_visit',
        description: 'RLS test event A',
      })
      .select('id')
      .single()
    eventAId = insertedA!.id

    const { data: insertedB } = await adminClient
      .from('lead_events')
      .insert({
        lead_id: LEAD_B_ID,
        tenant_id: TENANT_B_ID,
        type: 'page_visit',
        description: 'RLS test event B',
      })
      .select('id')
      .single()
    eventBId = insertedB!.id
  })

  afterAll(async () => {
    if (eventAId) {
      await adminClient.from('lead_events').delete().eq('id', eventAId)
    }
    if (eventBId) {
      await adminClient.from('lead_events').delete().eq('id', eventBId)
    }
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A events', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('lead_events')
      .select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === eventAId)).toBe(true)
  })

  it('tenant A user cannot see tenant B events', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_events')
      .select('id')
      .eq('id', eventBId)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert event for tenant B lead', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('lead_events').insert({
      lead_id: LEAD_B_ID,
      tenant_id: TENANT_B_ID,
      type: 'page_visit',
      description: 'Hacked event',
    })
    expect(error).not.toBeNull()
  })

  it('tenant A user cannot update tenant B events', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_events')
      .update({ description: 'Hacked' })
      .eq('id', eventBId)
      .select()
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot delete tenant B events', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_events')
      .delete()
      .eq('id', eventBId)
      .select()
    expect(data).toHaveLength(0)
    const { data: check } = await adminClient
      .from('lead_events')
      .select('id')
      .eq('id', eventBId)
    expect(check).toHaveLength(1)
  })

  it('super admin sees events from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('lead_events')
      .select('id')
      .in('id', [eventAId, eventBId])
    expect(data).toHaveLength(2)
  })
})
