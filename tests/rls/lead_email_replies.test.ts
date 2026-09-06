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

let replyAId: string
let replyBId: string

describe('RLS: lead_email_replies', () => {
  beforeAll(async () => {
    await createFixtures()

    const { data: a } = await adminClient
      .from('lead_email_replies')
      .insert({
        lead_id:    LEAD_A_ID,
        tenant_id:  TENANT_A_ID,
        from_email: 'lead-a@example.com',
        subject:    'Re: Guía RLS test A',
        body_text:  'Hola, este es el cuerpo del reply A.',
        received_at: new Date().toISOString(),
        provider_message_id: 'rls-test-reply-a',
      })
      .select('id')
      .single()
    replyAId = a!.id

    const { data: b } = await adminClient
      .from('lead_email_replies')
      .insert({
        lead_id:    LEAD_B_ID,
        tenant_id:  TENANT_B_ID,
        from_email: 'lead-b@example.com',
        subject:    'Re: Guía RLS test B',
        body_text:  'Hola, este es el cuerpo del reply B.',
        received_at: new Date().toISOString(),
        provider_message_id: 'rls-test-reply-b',
      })
      .select('id')
      .single()
    replyBId = b!.id
  })

  afterAll(async () => {
    if (replyAId) await adminClient.from('lead_email_replies').delete().eq('id', replyAId)
    if (replyBId) await adminClient.from('lead_email_replies').delete().eq('id', replyBId)
    await cleanupFixtures()
  })

  it('tenant A sees only their own replies', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_email_replies')
      .select('id, tenant_id')

    const ids = (data ?? []).map((r: { id: string }) => r.id)
    expect(ids).toContain(replyAId)
    expect(ids).not.toContain(replyBId)

    const tenants = [...new Set((data ?? []).map((r: { tenant_id: string }) => r.tenant_id))]
    expect(tenants).toEqual([TENANT_A_ID])
  })

  it('tenant A cannot read tenant B reply by id', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_email_replies')
      .select('id')
      .eq('id', replyBId)

    expect(data ?? []).toHaveLength(0)
  })

  it('super_admin sees both tenants', async () => {
    const client = await asSuperAdmin()
    const { data } = await client
      .from('lead_email_replies')
      .select('id')
      .in('id', [replyAId, replyBId])

    const ids = (data ?? []).map((r: { id: string }) => r.id)
    expect(ids).toContain(replyAId)
    expect(ids).toContain(replyBId)
  })

  it('dedup: inserting same provider_message_id for same lead is idempotent (23505)', async () => {
    const { error } = await adminClient
      .from('lead_email_replies')
      .insert({
        lead_id:    LEAD_A_ID,
        tenant_id:  TENANT_A_ID,
        from_email: 'lead-a@example.com',
        subject:    'Re: duplicate',
        body_text:  'duplicate body',
        received_at: new Date().toISOString(),
        provider_message_id: 'rls-test-reply-a',   // same as the one in beforeAll
      })

    expect(error?.code).toBe('23505')
  })
})
