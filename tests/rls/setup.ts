import { createClient } from '@supabase/supabase-js'
// Node.js < 22 does not ship native WebSocket support — provide the ws package
// as the Realtime transport so that createClient does not throw at startup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
// JWT secret — used to sign test tokens via the rls_test_mint_jwt(email, secret) RPC.
// Source: Supabase Dashboard → Settings → API → JWT Settings → JWT Secret.
// Store in .env.local as SUPABASE_JWT_SECRET (never commit the actual value).
const JWT_SECRET   = process.env.SUPABASE_JWT_SECRET!

// Shared options for all clients created in this test module
const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
} as const

export const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, clientOptions)

// Per-run cache: email → minted JWT (so we call rls_test_mint_jwt once per email)
const _jwtCache = new Map<string, string>()

// Returns a Supabase client authenticated as the given user.
//
// This project uses Magic Link only — password auth is disabled, and the Admin
// API's generateLink endpoint is also blocked at the project level. Instead we
// call rls_test_mint_jwt(email, secret) (a SECURITY DEFINER Postgres function,
// service_role only) which signs a valid HS256 JWT using the secret passed from
// SUPABASE_JWT_SECRET in .env.local. The JWT is cached for the life of the test
// process so we only hit the DB once per user per run.
//
// Prerequisite: add SUPABASE_JWT_SECRET to .env.local.
// JWT secret value: Supabase Dashboard → Settings → API → JWT Settings → JWT Secret.
//
// The second argument is kept for API compatibility but is unused.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function asUser(email: string, _password: string) {
  let accessToken = _jwtCache.get(email)

  if (!accessToken) {
    if (!JWT_SECRET) {
      throw new Error(
        'asUser: SUPABASE_JWT_SECRET is not set. ' +
        'Add it to .env.local — find it at: Supabase Dashboard → Settings → API → JWT Settings → JWT Secret'
      )
    }
    const { data, error } = await adminClient.rpc('rls_test_mint_jwt', {
      p_email: email,
      p_secret: JWT_SECRET,
    })
    if (error || !data) {
      throw new Error(
        `asUser: rls_test_mint_jwt(${email}) failed: ${error?.message ?? 'null'}`
      )
    }
    accessToken = data as string
    _jwtCache.set(email, accessToken)
  }

  return createClient(SUPABASE_URL, ANON_KEY, {
    ...clientOptions,
    global: {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  })
}

export function asSuperAdmin() {
  return adminClient
}

// ─── Fixture constants ────────────────────────────────────────────────────────

export const TEST_PASSWORD     = 'RlsTest_42!'
export const TENANT_A_ID       = 'tenant-rls-test-a'
export const TENANT_B_ID       = 'tenant-rls-test-b'
// Use example.com — a legitimate reserved test domain accepted by Supabase
export const USER_A_EMAIL      = 'rls-user-a@itmano-test.example.com'
export const USER_B_EMAIL      = 'rls-user-b@itmano-test.example.com'
export const SUPER_ADMIN_EMAIL = 'rls-super@itmano-test.example.com'

// Static UUIDs for acquisition_channels and email_sequences
// (their id columns are uuid, not text)
export const CHANNEL_A_UUID = '00000000-0000-0000-0000-000000000a01'
export const CHANNEL_B_UUID = '00000000-0000-0000-0000-000000000b01'
export const SEQ_A_UUID     = '00000000-0000-0000-0000-000000000a02'
export const SEQ_B_UUID     = '00000000-0000-0000-0000-000000000b02'
export const FORM_SUB_A_UUID = '00000000-0000-0000-0000-000000000a03'
export const FORM_SUB_B_UUID = '00000000-0000-0000-0000-000000000b03'

// Text IDs for agents and leads
export const AGENT_A_ID = 'agent-rls-test-a'
export const AGENT_B_ID = 'agent-rls-test-b'
export const LEAD_A_ID  = 'lead-rls-test-a'
export const LEAD_B_ID  = 'lead-rls-test-b'

// public_id must match ^chn_[a-z0-9]{12}$
const PUBLIC_ID_A = 'chn_rlstestaaa01'
const PUBLIC_ID_B = 'chn_rlstestbbb01'

// Call once before all RLS tests — idempotent (uses upsert)
export async function createFixtures(): Promise<{
  userAId: string
  userBId: string
  superAdminId: string
}> {
  // 1. Create tenants
  await adminClient.from('tenants').upsert(
    [
      { id: TENANT_A_ID, name: 'RLS Test Tenant A', slug: 'rls-test-a' },
      { id: TENANT_B_ID, name: 'RLS Test Tenant B', slug: 'rls-test-b' },
    ],
    { onConflict: 'id' }
  )

  // 2. Create auth users via the rls_test_create_user() SQL helper (SECURITY DEFINER,
  //    service_role only). The Supabase Admin API createUser is blocked by a project-level
  //    setting; direct SQL is the reliable path for test fixtures.
  //    Sequential to minimise race conditions between parallel test suite runs.
  async function getOrCreateUser(email: string): Promise<string> {
    const { data, error } = await adminClient.rpc('rls_test_create_user', {
      p_email: email,
      p_password: TEST_PASSWORD,
    })
    if (error) throw new Error(`rls_test_create_user(${email}): ${error.message}`)
    return data as string
  }

  const userAId      = await getOrCreateUser(USER_A_EMAIL)
  const userBId      = await getOrCreateUser(USER_B_EMAIL)
  const superAdminId = await getOrCreateUser(SUPER_ADMIN_EMAIL)

  // 3. Upsert user_profiles (links auth user to tenant + role)
  await adminClient.from('user_profiles').upsert(
    [
      { id: userAId,      tenant_id: TENANT_A_ID, role: 'agent_owner' },
      { id: userBId,      tenant_id: TENANT_B_ID, role: 'agent_owner' },
      { id: superAdminId, tenant_id: TENANT_A_ID, role: 'super_admin' },
    ],
    { onConflict: 'id' }
  )

  // 4. Create agents (one per tenant — needed for leads FK)
  await adminClient.from('agents').upsert(
    [
      {
        id: AGENT_A_ID,
        tenant_id: TENANT_A_ID,
        name: 'Agent A',
        email: 'agent-a@test.invalid',
        language: 'es',
        specialty: 'hispanic',
        avatar_initials: 'AA',
        accent_color: '#5B8EC9',
      },
      {
        id: AGENT_B_ID,
        tenant_id: TENANT_B_ID,
        name: 'Agent B',
        email: 'agent-b@test.invalid',
        language: 'en',
        specialty: 'military',
        avatar_initials: 'AB',
        accent_color: '#5AAFA0',
      },
    ],
    { onConflict: 'id' }
  )

  // 5. Create acquisition channels (UUID primary keys, public_id must match regex)
  await adminClient.from('acquisition_channels').upsert(
    [
      {
        id: CHANNEL_A_UUID,
        tenant_id: TENANT_A_ID,
        public_id: PUBLIC_ID_A,
        channel_type: 'manual',
        name: 'RLS Test Channel A',
        slug: 'rls-channel-a',
      },
      {
        id: CHANNEL_B_UUID,
        tenant_id: TENANT_B_ID,
        public_id: PUBLIC_ID_B,
        channel_type: 'manual',
        name: 'RLS Test Channel B',
        slug: 'rls-channel-b',
      },
    ],
    { onConflict: 'id' }
  )

  // 6. Create leads (one per tenant; acquisition_channel_id is nullable)
  await adminClient.from('leads').upsert(
    [
      {
        id: LEAD_A_ID,
        tenant_id: TENANT_A_ID,
        agent_id: AGENT_A_ID,
        acquisition_channel_id: CHANNEL_A_UUID,
        first_name: 'Lead',
        last_name: 'A',
        email: 'lead-a@test.invalid',
        language: 'es',
        status: 'new',
        temperature_score: 10,
      },
      {
        id: LEAD_B_ID,
        tenant_id: TENANT_B_ID,
        agent_id: AGENT_B_ID,
        acquisition_channel_id: CHANNEL_B_UUID,
        first_name: 'Lead',
        last_name: 'B',
        email: 'lead-b@test.invalid',
        language: 'en',
        status: 'new',
        temperature_score: 10,
      },
    ],
    { onConflict: 'id' }
  )

  // 7. Create email sequences (UUID primary keys; acquisition_channel_id was dropped
  //    in migration 023 — relationship is now acquisition_channels.email_sequence_id)
  await adminClient.from('email_sequences').upsert(
    [
      {
        id: SEQ_A_UUID,
        tenant_id: TENANT_A_ID,
        name: 'RLS Seq A',
      },
      {
        id: SEQ_B_UUID,
        tenant_id: TENANT_B_ID,
        name: 'RLS Seq B',
      },
    ],
    { onConflict: 'id' }
  )

  // 8. Create form_submissions (one per tenant; FK to channel + lead)
  await adminClient.from('form_submissions').upsert(
    [
      {
        id: FORM_SUB_A_UUID,
        tenant_id: TENANT_A_ID,
        channel_id: CHANNEL_A_UUID,
        lead_id: LEAD_A_ID,
        answers: [{ key: 'timeline', question: '¿Horizonte?', value: 'q1', label: 'Menos de 3 meses' }],
      },
      {
        id: FORM_SUB_B_UUID,
        tenant_id: TENANT_B_ID,
        channel_id: CHANNEL_B_UUID,
        lead_id: LEAD_B_ID,
        answers: [{ key: 'timeline', question: '¿Horizonte?', value: 'q2', label: 'Más de 6 meses' }],
      },
    ],
    { onConflict: 'id' }
  )

  return { userAId, userBId, superAdminId }
}

// Call once after all RLS tests — cleans up in reverse FK order
export async function cleanupFixtures() {
  // form_submissions (FK to leads + channels; delete before them)
  await adminClient
    .from('form_submissions')
    .delete()
    .in('tenant_id', [TENANT_A_ID, TENANT_B_ID])

  // lead_sequence_runs
  await adminClient
    .from('lead_sequence_runs')
    .delete()
    .in('tenant_id', [TENANT_A_ID, TENANT_B_ID])

  // email_sequence_steps
  await adminClient
    .from('email_sequence_steps')
    .delete()
    .in('sequence_id', [SEQ_A_UUID, SEQ_B_UUID])

  // email_sequences
  await adminClient
    .from('email_sequences')
    .delete()
    .in('id', [SEQ_A_UUID, SEQ_B_UUID])

  // lead_events
  await adminClient
    .from('lead_events')
    .delete()
    .in('tenant_id', [TENANT_A_ID, TENANT_B_ID])

  // leads
  await adminClient
    .from('leads')
    .delete()
    .in('id', [LEAD_A_ID, LEAD_B_ID])

  // acquisition_channels
  await adminClient
    .from('acquisition_channels')
    .delete()
    .in('id', [CHANNEL_A_UUID, CHANNEL_B_UUID])

  // agents
  await adminClient
    .from('agents')
    .delete()
    .in('id', [AGENT_A_ID, AGENT_B_ID])

  // channel_page_views
  await adminClient
    .from('channel_page_views')
    .delete()
    .in('tenant_id', [TENANT_A_ID, TENANT_B_ID])

  // user_profiles cascade-delete when auth.users row is deleted (ON DELETE CASCADE)
  // Use the rls_test_delete_user() SQL helper — matches the create path
  for (const email of [USER_A_EMAIL, USER_B_EMAIL, SUPER_ADMIN_EMAIL]) {
    await adminClient.rpc('rls_test_delete_user', { p_email: email })
  }

  // tenants last
  await adminClient
    .from('tenants')
    .delete()
    .in('id', [TENANT_A_ID, TENANT_B_ID])
}
