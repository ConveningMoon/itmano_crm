import { createClient } from '@supabase/supabase-js'
// Node.js < 22 does not ship native WebSocket support — provide the ws package
// as the Realtime transport so that createClient does not throw at startup.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY     = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!
// Sólo se usa como respaldo, cuando el proyecto no acepta password auth (ver
// tokenMinteado más abajo). Contra el sandbox no hace falta.
// Fuente: Supabase Dashboard → Settings → API → JWT Settings → JWT Secret.
const JWT_SECRET   = process.env.SUPABASE_JWT_SECRET!

// A qué proyecto pegan estas suites lo decide vitest.config.ts, que carga
// .env.test.local → .env.development.local → .env.local en ese orden. Con el
// sandbox configurado, los fixtures dejan de crearse en la base de A&J.

// Shared options for all clients created in this test module
const clientOptions = {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
} as const

export const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, clientOptions)

// Per-run cache: email → minted JWT (so we call rls_test_mint_jwt once per email)
const _jwtCache = new Map<string, string>()

// Token real emitido por GoTrue. Es el camino preferido: los fixtures se crean
// con contraseña (rls_test_create_user), así que si el proyecto tiene el
// proveedor de email habilitado —el sandbox lo tiene— podemos iniciar sesión de
// verdad. El token trae exactamente los claims que tendría en producción, en vez
// de los que nosotros decidamos ponerle a un JWT firmado a mano.
//
// Devuelve null si el proyecto no permite password auth, para que el llamador
// caiga al minteo manual.
async function tokenDeGoTrue(email: string, password: string): Promise<string | null> {
  const cliente = createClient(SUPABASE_URL, ANON_KEY, clientOptions)
  const { data, error } = await cliente.auth.signInWithPassword({ email, password })
  if (error || !data.session) return null
  return data.session.access_token
}

// Respaldo para proyectos con el password auth deshabilitado (producción lo
// está: el login del CRM es Magic Link puro). rls_test_mint_jwt es una función
// SECURITY DEFINER, sólo service_role, que firma un HS256 válido con el secreto
// que le pasamos desde SUPABASE_JWT_SECRET.
async function tokenMinteado(email: string): Promise<string> {
  if (!JWT_SECRET) {
    throw new Error(
      `asUser(${email}): el proyecto no acepta password auth y no hay SUPABASE_JWT_SECRET ` +
      'para firmar el token a mano. Añádelo al .env que corresponda — está en: ' +
      'Supabase Dashboard → Settings → API → JWT Settings → JWT Secret'
    )
  }
  const { data, error } = await adminClient.rpc('rls_test_mint_jwt', {
    p_email:  email,
    p_secret: JWT_SECRET,
  })
  if (error || !data) {
    throw new Error(`asUser: rls_test_mint_jwt(${email}) falló: ${error?.message ?? 'null'}`)
  }
  return data as string
}

// Devuelve un cliente de Supabase autenticado como ese usuario.
//
// El token se cachea durante el proceso de test, así que cada usuario se
// autentica una sola vez por corrida.
export async function asUser(email: string, password: string = TEST_PASSWORD) {
  let accessToken = _jwtCache.get(email)

  if (!accessToken) {
    accessToken = (await tokenDeGoTrue(email, password)) ?? (await tokenMinteado(email))
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
export const INVITE_A_UUID   = '00000000-0000-0000-0000-000000000a04'
export const INVITE_B_UUID   = '00000000-0000-0000-0000-000000000b04'
export const STUDIO_IMG_A_UUID = '00000000-0000-0000-0000-000000000a05'
export const STUDIO_IMG_B_UUID = '00000000-0000-0000-0000-000000000b05'

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
  //
  // `stage`, no `status`: la migracion 083 borro la columna. `temperature_score`
  // tampoco se siembra — es legacy y nadie la escribe desde la 072.
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
        stage: 'nuevo',
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
        stage: 'nuevo',
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

  // 9. Create invitations (one pending per tenant; distinct emails so the
  //    (tenant_id, email) WHERE status='pending' partial unique index is satisfied)
  await adminClient.from('invitations').upsert(
    [
      {
        id: INVITE_A_UUID,
        tenant_id: TENANT_A_ID,
        email: 'invite-a@itmano-test.example.com',
        role: 'agent',
        status: 'pending',
      },
      {
        id: INVITE_B_UUID,
        tenant_id: TENANT_B_ID,
        email: 'invite-b@itmano-test.example.com',
        role: 'agent',
        status: 'pending',
      },
    ],
    { onConflict: 'id' }
  )

  // 10. Create studio_images (una pieza por tenant). Sin property_id: el
  //     aislamiento que se prueba es por tenant_id y no depende de la propiedad.
  await adminClient.from('studio_images').upsert(
    [
      {
        id: STUDIO_IMG_A_UUID,
        tenant_id: TENANT_A_ID,
        recipe: 'new_listing',
        form_json: { recipe: 'new_listing', address: '1 Test St', price: 100000 },
        source_mode: 'generate',
        style: 'editorial',
        aspect: '4:5',
        status: 'ready',
      },
      {
        id: STUDIO_IMG_B_UUID,
        tenant_id: TENANT_B_ID,
        recipe: 'sold',
        form_json: { recipe: 'sold', address: '2 Test Ave', show_price: false },
        source_mode: 'photo',
        style: 'warm_home',
        aspect: '1:1',
        status: 'ready',
      },
    ],
    { onConflict: 'id' }
  )

  return { userAId, userBId, superAdminId }
}

// Call once after all RLS tests — cleans up in reverse FK order
export async function cleanupFixtures() {
  // studio_images (FK a tenants/agents/properties; delete antes que ellos)
  await adminClient
    .from('studio_images')
    .delete()
    .in('tenant_id', [TENANT_A_ID, TENANT_B_ID])

  // invitations (FK to tenants + agents; delete before them)
  await adminClient
    .from('invitations')
    .delete()
    .in('tenant_id', [TENANT_A_ID, TENANT_B_ID])

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
