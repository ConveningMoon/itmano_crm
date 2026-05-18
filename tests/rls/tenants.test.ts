import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  createFixtures,
  cleanupFixtures,
} from './setup'

describe('RLS: tenants', () => {
  beforeAll(async () => {
    await createFixtures()
  })
  afterAll(async () => {
    await cleanupFixtures()
  })

  it('tenant A user sees only their own tenant row', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client.from('tenants').select('id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    // All returned rows must be tenant A
    expect(data!.every((r) => r.id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === TENANT_A_ID)).toBe(true)
  })

  it('tenant A user cannot see tenant B row', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('tenants')
      .select('id')
      .eq('id', TENANT_B_ID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot INSERT a new tenant', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('tenants').insert({
      id: 'tenant-rls-unauthorized',
      name: 'Unauthorized Tenant',
      slug: 'unauthorized-tenant',
    })
    // No INSERT policy on tenants — must fail
    expect(error).not.toBeNull()
  })

  it('tenant A user cannot UPDATE their own tenant row', async () => {
    // No UPDATE policy on tenants — RLS silently matches 0 rows (no error, no effect)
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('tenants')
      .update({ name: 'Hacked Name' })
      .eq('id', TENANT_A_ID)
      .select('id')
    expect(data).toHaveLength(0)
    // Verify row is actually unchanged
    const { data: check } = await adminClient
      .from('tenants')
      .select('name')
      .eq('id', TENANT_A_ID)
    expect(check![0].name).not.toBe('Hacked Name')
  })

  it('tenant A user cannot DELETE their own tenant row', async () => {
    // No DELETE policy on tenants — RLS silently matches 0 rows (no error, no effect)
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('tenants')
      .delete()
      .eq('id', TENANT_A_ID)
      .select('id')
    expect(data).toHaveLength(0)
    // Verify row still exists
    const { data: check } = await adminClient
      .from('tenants')
      .select('id')
      .eq('id', TENANT_A_ID)
    expect(check).toHaveLength(1)
  })

  it('super admin sees both tenant rows', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('tenants')
      .select('id')
      .in('id', [TENANT_A_ID, TENANT_B_ID])
    expect(data).toHaveLength(2)
  })
})
