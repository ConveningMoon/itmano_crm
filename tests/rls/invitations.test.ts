import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  INVITE_A_UUID,
  INVITE_B_UUID,
  createFixtures,
  cleanupFixtures,
} from './setup'

describe('RLS: invitations', () => {
  beforeAll(async () => {
    await createFixtures()
  })
  afterAll(async () => {
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A invitations', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client.from('invitations').select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === INVITE_A_UUID)).toBe(true)
  })

  it('tenant A user cannot see tenant B invitations', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('invitations')
      .select('id')
      .eq('id', INVITE_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('writes are denied to authenticated users (service_role only — no write policy)', async () => {
    // invitations has a SELECT policy only; with RLS enabled, INSERT is denied by
    // default for non-service_role. Confirms the defense-in-depth posture.
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('invitations').insert({
      tenant_id: TENANT_A_ID,
      email: 'rls-attempt@itmano-test.example.com',
      role: 'agent',
    })
    expect(error).not.toBeNull()
    // Nothing leaked through.
    await adminClient
      .from('invitations')
      .delete()
      .eq('email', 'rls-attempt@itmano-test.example.com')
  })

  it('super admin sees invitations from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('invitations')
      .select('id')
      .in('id', [INVITE_A_UUID, INVITE_B_UUID])
    expect(data).toHaveLength(2)
  })

  it('tenant A user does not see tenant B invitations in an unfiltered list', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client.from('invitations').select('tenant_id')
    expect(data).not.toBeNull()
    expect(data!.some((r) => r.tenant_id === TENANT_B_ID)).toBe(false)
  })
})
