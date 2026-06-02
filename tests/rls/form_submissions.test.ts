import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  CHANNEL_B_UUID,
  LEAD_B_ID,
  FORM_SUB_A_UUID,
  FORM_SUB_B_UUID,
  createFixtures,
  cleanupFixtures,
} from './setup'

describe('RLS: form_submissions', () => {
  beforeAll(async () => {
    await createFixtures()
  })
  afterAll(async () => {
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client
      .from('form_submissions')
      .select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === FORM_SUB_A_UUID)).toBe(true)
  })

  it('tenant A user cannot see tenant B rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('form_submissions')
      .select('id')
      .eq('id', FORM_SUB_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert a row for tenant B', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('form_submissions').insert({
      tenant_id: TENANT_B_ID,
      channel_id: CHANNEL_B_UUID,
      lead_id: LEAD_B_ID,
      answers: [{ key: 'x', value: 'y' }],
    })
    expect(error).not.toBeNull()
    // Cleanup any accidental insert (shouldn't exist due to RLS)
    await adminClient
      .from('form_submissions')
      .delete()
      .eq('tenant_id', TENANT_B_ID)
      .eq('lead_id', LEAD_B_ID)
      .neq('id', FORM_SUB_B_UUID)
  })

  it('tenant A user cannot update tenant B rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('form_submissions')
      .update({ responded: true })
      .eq('id', FORM_SUB_B_UUID)
      .select()
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot delete tenant B rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('form_submissions')
      .delete()
      .eq('id', FORM_SUB_B_UUID)
      .select()
    expect(data).toHaveLength(0)
    const { data: check } = await adminClient
      .from('form_submissions')
      .select('id')
      .eq('id', FORM_SUB_B_UUID)
    expect(check).toHaveLength(1)
  })

  it('super admin sees rows from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('form_submissions')
      .select('id')
      .in('id', [FORM_SUB_A_UUID, FORM_SUB_B_UUID])
    expect(data).toHaveLength(2)
  })
})
