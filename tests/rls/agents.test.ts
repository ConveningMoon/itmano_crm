import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  AGENT_A_ID,
  AGENT_B_ID,
  createFixtures,
  cleanupFixtures,
} from './setup'

describe('RLS: agents', () => {
  beforeAll(async () => {
    await createFixtures()
  })
  afterAll(async () => {
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A agents', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client.from('agents').select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === AGENT_A_ID)).toBe(true)
  })

  it('tenant A user cannot see tenant B agents', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('agents')
      .select('id')
      .eq('id', AGENT_B_ID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert agent for tenant B', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('agents').insert({
      id: 'agent-rls-attempt',
      tenant_id: TENANT_B_ID,
      name: 'Hacker',
      email: 'hacker@test.invalid',
      language: 'es',
      specialty: 'hispanic',
      avatar_initials: 'HA',
      accent_color: '#000000',
    })
    expect(error).not.toBeNull()
    await adminClient.from('agents').delete().eq('id', 'agent-rls-attempt')
  })

  it('tenant A user cannot update tenant B agents', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('agents')
      .update({ name: 'Hacked' })
      .eq('id', AGENT_B_ID)
      .select()
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot delete tenant B agents', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('agents')
      .delete()
      .eq('id', AGENT_B_ID)
      .select()
    expect(data).toHaveLength(0)
    const { data: check } = await adminClient
      .from('agents')
      .select('id')
      .eq('id', AGENT_B_ID)
    expect(check).toHaveLength(1)
  })

  it('super admin sees agents from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('agents')
      .select('id')
      .in('id', [AGENT_A_ID, AGENT_B_ID])
    expect(data).toHaveLength(2)
  })
})
