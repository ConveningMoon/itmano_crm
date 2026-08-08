import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  asSuperAdmin,
  TENANT_A_ID,
  TENANT_B_ID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  STUDIO_IMG_A_UUID,
  STUDIO_IMG_B_UUID,
  createFixtures,
  cleanupFixtures,
} from './setup'

describe('RLS: studio_images', () => {
  beforeAll(async () => {
    await createFixtures()
  })
  afterAll(async () => {
    await cleanupFixtures()
  })

  it('tenant A user sees only tenant A rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client.from('studio_images').select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === STUDIO_IMG_A_UUID)).toBe(true)
  })

  it('tenant A user cannot see tenant B rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client.from('studio_images').select('id').eq('id', STUDIO_IMG_B_UUID)
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot insert a row for tenant B', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { error } = await client.from('studio_images').insert({
      tenant_id: TENANT_B_ID,
      recipe: 'event',
      form_json: { recipe: 'event' },
      style: 'editorial',
      aspect: '1:1',
    })
    expect(error).not.toBeNull()
    // Limpieza por si algo se colara (no debería, por RLS)
    await adminClient
      .from('studio_images')
      .delete()
      .eq('tenant_id', TENANT_B_ID)
      .neq('id', STUDIO_IMG_B_UUID)
  })

  it('tenant A user cannot update tenant B rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('studio_images')
      .update({ status: 'failed' })
      .eq('id', STUDIO_IMG_B_UUID)
      .select()
    expect(data).toHaveLength(0)
  })

  it('tenant A user cannot delete tenant B rows', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client.from('studio_images').delete().eq('id', STUDIO_IMG_B_UUID).select()
    expect(data).toHaveLength(0)
    const { data: check } = await adminClient
      .from('studio_images')
      .select('id')
      .eq('id', STUDIO_IMG_B_UUID)
    expect(check).toHaveLength(1)
  })

  it('super admin sees rows from both tenants', async () => {
    const client = asSuperAdmin()
    const { data } = await client
      .from('studio_images')
      .select('id')
      .in('id', [STUDIO_IMG_A_UUID, STUDIO_IMG_B_UUID])
    expect(data).toHaveLength(2)
  })
})
