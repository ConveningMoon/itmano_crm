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
  AGENT_A_ID,
  createFixtures,
  cleanupFixtures,
} from './setup'

describe('RLS: leads', () => {
  beforeAll(async () => {
    await createFixtures()
  })
  afterAll(async () => {
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A leads', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client.from('leads').select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === LEAD_A_ID)).toBe(true)
  })

  it('tenant A user cannot see tenant B leads', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('leads')
      .select('id')
      .eq('id', LEAD_B_ID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert lead for tenant B', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('leads').insert({
      id: 'lead-rls-attempt',
      tenant_id: TENANT_B_ID,
      agent_id: AGENT_A_ID,
      first_name: 'Hacker',
      last_name: 'Lead',
      email: 'hacker-lead@test.invalid',
      language: 'es',
      status: 'new',
      temperature_score: 0,
    })
    expect(error).not.toBeNull()
    await adminClient.from('leads').delete().eq('id', 'lead-rls-attempt')
  })

  it('tenant A user cannot update tenant B leads', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('leads')
      .update({ first_name: 'Hacked' })
      .eq('id', LEAD_B_ID)
      .select()
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot delete tenant B leads', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('leads')
      .delete()
      .eq('id', LEAD_B_ID)
      .select()
    expect(data).toHaveLength(0)
    const { data: check } = await adminClient
      .from('leads')
      .select('id')
      .eq('id', LEAD_B_ID)
    expect(check).toHaveLength(1)
  })

  it('super admin sees leads from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('leads')
      .select('id')
      .in('id', [LEAD_A_ID, LEAD_B_ID])
    expect(data).toHaveLength(2)
  })
})
