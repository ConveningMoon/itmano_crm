import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import {
  adminClient,
  asUser,
  TENANT_A_ID,
  TENANT_B_ID,
  CHANNEL_A_UUID,
  CHANNEL_B_UUID,
  USER_A_EMAIL,
  TEST_PASSWORD,
  createFixtures,
  cleanupFixtures,
} from './setup'

// Node.js < 22 no trae WebSocket nativo — mismo motivo que en setup.ts: sin
// esto createClient revienta al construirse, aunque el test nunca use Realtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ws = require('ws') as typeof WebSocket

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente anónimo real (rol `anon`, sin sesión) — así se prueban las policies
// públicas de newsletter_editions tal como las ve la página alojada pública,
// no un usuario autenticado sin permisos.
function anonClient() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  })
}

const EDITION_A_PUBLISHED_UUID = '00000000-0000-0000-0000-000000000a10'
const EDITION_A_DRAFT_UUID = '00000000-0000-0000-0000-000000000a11'
const EDITION_A_BILLING_UUID = '00000000-0000-0000-0000-000000000a12'
const EDITION_B_PUBLISHED_UUID = '00000000-0000-0000-0000-000000000b10'

// Mismas columnas concedidas a `anon` por la migración 105 — si esta lista se
// desincroniza del grant real, el test de la columna vedada deja de proteger
// nada.
const PUBLIC_COLUMNS =
  'id, tenant_id, channel_id, slug, title, dek, language, translation_group_id, ' +
  'cover_image_url, content, sources, data_as_of, status, published_at, created_at'

describe('RLS: newsletter_editions', () => {
  beforeAll(async () => {
    await createFixtures()

    const { error } = await adminClient.from('newsletter_editions').upsert(
      [
        {
          id: EDITION_A_PUBLISHED_UUID,
          tenant_id: TENANT_A_ID,
          channel_id: CHANNEL_A_UUID,
          slug: 'rls-test-published',
          title: 'Edición publicada A',
          cover_image_url: 'https://example.com/rls-test/cover-a-published.jpg',
          status: 'published',
          published_at: new Date().toISOString(),
          // supabase-js manda la unión de claves de todas las filas del batch y
          // rellena con NULL las que una fila omite (no con el default de la
          // columna) — mismo caso que documenta lead_score_rules.test.ts con
          // is_active. unpublished_by_billing es NOT NULL, así que hay que
          // fijarlo explícito en cada fila.
          unpublished_by_billing: false,
        },
        {
          id: EDITION_A_DRAFT_UUID,
          tenant_id: TENANT_A_ID,
          channel_id: CHANNEL_A_UUID,
          slug: 'rls-test-draft',
          title: 'Edición borrador A',
          cover_image_url: 'https://example.com/rls-test/cover-a-draft.jpg',
          status: 'draft',
          unpublished_by_billing: false,
        },
        {
          id: EDITION_A_BILLING_UUID,
          tenant_id: TENANT_A_ID,
          channel_id: CHANNEL_A_UUID,
          slug: 'rls-test-billing',
          title: 'Edición degradada por billing A',
          cover_image_url: 'https://example.com/rls-test/cover-a-billing.jpg',
          status: 'published',
          published_at: new Date().toISOString(),
          unpublished_by_billing: true,
        },
        {
          id: EDITION_B_PUBLISHED_UUID,
          tenant_id: TENANT_B_ID,
          channel_id: CHANNEL_B_UUID,
          slug: 'rls-test-published',
          title: 'Edición publicada B',
          cover_image_url: 'https://example.com/rls-test/cover-b-published.jpg',
          status: 'published',
          published_at: new Date().toISOString(),
          unpublished_by_billing: false,
        },
      ],
      { onConflict: 'id' }
    )
    if (error) throw new Error(`fixture newsletter_editions: ${error.message}`)
  })

  afterAll(async () => {
    await adminClient
      .from('newsletter_editions')
      .delete()
      .in('id', [
        EDITION_A_PUBLISHED_UUID,
        EDITION_A_DRAFT_UUID,
        EDITION_A_BILLING_UUID,
        EDITION_B_PUBLISHED_UUID,
      ])
    await cleanupFixtures()
  })

  it('agent_owner del tenant A no ve ediciones del tenant B', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data, error } = await client.from('newsletter_editions').select('id, tenant_id')
    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.every((r) => r.tenant_id === TENANT_A_ID)).toBe(true)
    expect(data!.some((r) => r.id === EDITION_B_PUBLISHED_UUID)).toBe(false)

    // Sí ve las suyas — incluida la que no está publicada, porque la policy
    // autenticada es por tenant, no por status.
    const { data: byId } = await client
      .from('newsletter_editions')
      .select('id')
      .eq('id', EDITION_B_PUBLISHED_UUID)
    expect(byId).toHaveLength(0)
    expect(data!.some((r) => r.id === EDITION_A_DRAFT_UUID)).toBe(true)
  })

  it('anon ve una edición published y no ve una draft', async () => {
    const client = anonClient()

    const { data: published, error: publishedError } = await client
      .from('newsletter_editions')
      .select(PUBLIC_COLUMNS)
      .eq('id', EDITION_A_PUBLISHED_UUID)
    expect(publishedError).toBeNull()
    expect(published).toHaveLength(1)

    const { data: draft, error: draftError } = await client
      .from('newsletter_editions')
      .select(PUBLIC_COLUMNS)
      .eq('id', EDITION_A_DRAFT_UUID)
    expect(draftError).toBeNull()
    expect(draft).toHaveLength(0)
  })

  it('anon no ve una edición published pero degradada por billing', async () => {
    const client = anonClient()
    const { data, error } = await client
      .from('newsletter_editions')
      .select(PUBLIC_COLUMNS)
      .eq('id', EDITION_A_BILLING_UUID)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('anon recibe error al pedir una columna vedada, y las concedidas sí funcionan', async () => {
    const client = anonClient()

    const { data: forbidden, error: forbiddenError } = await client
      .from('newsletter_editions')
      .select('id, ai_run')
      .eq('id', EDITION_A_PUBLISHED_UUID)
    expect(forbiddenError).not.toBeNull()
    expect(forbidden).toBeNull()

    const { data: allowed, error: allowedError } = await client
      .from('newsletter_editions')
      .select(PUBLIC_COLUMNS)
      .eq('id', EDITION_A_PUBLISHED_UUID)
    expect(allowedError).toBeNull()
    expect(allowed).toHaveLength(1)
    // El cliente no está tipado con Database, y PUBLIC_COLUMNS se arma en
    // tiempo de compilación: postgrest-js no puede parsear ese string como
    // literal y resuelve el tipo de fila a GenericStringError. La forma real
    // ya se comprobó arriba (length 1, sin error) — este cast solo permite
    // leer 'id' de esa fila.
    const row = allowed![0] as unknown as { id: string }
    expect(row.id).toBe(EDITION_A_PUBLISHED_UUID)
  })
})
