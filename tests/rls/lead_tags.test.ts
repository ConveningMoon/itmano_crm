import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  TENANT_A_ID,
  TENANT_B_ID,
  LEAD_A_ID,
  USER_A_EMAIL,
  USER_B_EMAIL,
  TEST_PASSWORD,
  createFixtures,
  cleanupFixtures,
} from './setup'

// Las etiquetas (migración 116) son del TENANT, no de la persona — al contrario
// que las carpetas de la 115. Estos casos fijan las dos mitades de eso:
//
//   · el equipo comparte su catálogo (por eso no se prueba aislamiento entre dos
//     usuarios del mismo tenant: ahí compartir es lo correcto),
//   · y ninguna agencia ve, crea ni borra las etiquetas de otra.
//
// La asignación se prueba aparte porque su tenant_id es redundante con el del
// lead: si esa columna no estuviera vigilada, una asignación podría colgar un
// lead ajeno de una etiqueta propia.

const TAG_A_UUID = '00000000-0000-0000-0000-000000000a07'
const TAG_B_UUID = '00000000-0000-0000-0000-000000000b07'

describe('RLS: lead_tags', () => {
  beforeAll(async () => {
    await createFixtures()
  })

  afterAll(async () => {
    await adminClient.from('lead_tag_assignments').delete().in('tag_id', [TAG_A_UUID, TAG_B_UUID])
    await adminClient.from('lead_tags').delete().in('id', [TAG_A_UUID, TAG_B_UUID])
    await cleanupFixtures()
  })

  it('el propietario crea una etiqueta de su tenant y la ve', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)

    const { error } = await client.from('lead_tags').insert({
      id: TAG_A_UUID, tenant_id: TENANT_A_ID,
      name: 'Contactado sin respuesta', slug: 'contactado-sin-respuesta-rls',
      color: '#C97B6B',
    })
    expect(error).toBeNull()

    const { data } = await client.from('lead_tags').select('id').eq('id', TAG_A_UUID)
    expect(data).toHaveLength(1)
  })

  it('otra agencia no ve esa etiqueta', async () => {
    const client = await asUser(USER_B_EMAIL, TEST_PASSWORD)
    const { data } = await client.from('lead_tags').select('id').eq('id', TAG_A_UUID)
    expect(data).toHaveLength(0)
  })

  it('nadie crea una etiqueta en el catálogo de otra agencia', async () => {
    const client = await asUser(USER_B_EMAIL, TEST_PASSWORD)

    const { error } = await client.from('lead_tags').insert({
      id: TAG_B_UUID, tenant_id: TENANT_A_ID,
      name: 'Etiqueta impostora', slug: 'etiqueta-impostora-rls',
    })
    expect(error).not.toBeNull()
  })

  it('no se puede renombrar ni borrar la etiqueta de otra agencia', async () => {
    const client = await asUser(USER_B_EMAIL, TEST_PASSWORD)

    const { data: updated } = await client
      .from('lead_tags').update({ name: 'Secuestrada' }).eq('id', TAG_A_UUID).select()
    expect(updated).toHaveLength(0)

    const { data: deleted } = await client
      .from('lead_tags').delete().eq('id', TAG_A_UUID).select()
    expect(deleted).toHaveLength(0)

    // Y sigue intacta.
    const { data } = await adminClient.from('lead_tags').select('name').eq('id', TAG_A_UUID)
    expect(data?.[0]?.name).toBe('Contactado sin respuesta')
  })

  // La asignación va en el MISMO describe y no en otro: cleanupFixtures borra los
  // usuarios de auth y asUser cachea su JWT por email, así que un segundo
  // createFixtures dejaría tokens firmados con un uid que ya no existe y las
  // policies negarían todo por una razón que no es la que se está probando.

  it('el propietario etiqueta un lead de su tenant', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)

    const { error } = await client.from('lead_tag_assignments').insert({
      lead_id: LEAD_A_ID, tag_id: TAG_A_UUID, tenant_id: TENANT_A_ID,
    })
    expect(error).toBeNull()

    const { data } = await client
      .from('lead_tag_assignments').select('lead_id').eq('tag_id', TAG_A_UUID)
    expect(data).toHaveLength(1)
  })

  it('otra agencia no ve la asignación', async () => {
    const client = await asUser(USER_B_EMAIL, TEST_PASSWORD)
    const { data } = await client
      .from('lead_tag_assignments').select('lead_id').eq('tag_id', TAG_A_UUID)
    expect(data).toHaveLength(0)
  })

  it('otra agencia no puede etiquetar un lead ajeno, ni declarándose de su tenant', async () => {
    const client = await asUser(USER_B_EMAIL, TEST_PASSWORD)

    // Con el tenant del lead: la policy compara contra el tenant de QUIEN escribe.
    const conTenantAjeno = await client.from('lead_tag_assignments').insert({
      lead_id: LEAD_A_ID, tag_id: TAG_A_UUID, tenant_id: TENANT_A_ID,
    })
    expect(conTenantAjeno.error).not.toBeNull()

    // Con su propio tenant pasaría el filtro de tenant, y por eso la policy pide
    // además que ese tenant sea dueño del lead Y de la etiqueta: si no, quedaría
    // una fila apuntando a dos cosas que quien la escribió no puede ni ver.
    const conTenantPropio = await client.from('lead_tag_assignments').insert({
      lead_id: LEAD_A_ID, tag_id: TAG_A_UUID, tenant_id: TENANT_B_ID,
    })
    expect(conTenantPropio.error).not.toBeNull()

    // Y no quedó rastro de ninguno de los dos intentos.
    const { data } = await adminClient
      .from('lead_tag_assignments').select('tenant_id').eq('lead_id', LEAD_A_ID)
    expect(data?.every(r => r.tenant_id === TENANT_A_ID)).toBe(true)
  })

  it('quitar la etiqueta es cosa de su propio tenant', async () => {
    const ajeno = await asUser(USER_B_EMAIL, TEST_PASSWORD)
    const { data: noBorrado } = await ajeno
      .from('lead_tag_assignments').delete().eq('tag_id', TAG_A_UUID).select()
    expect(noBorrado).toHaveLength(0)

    const propio = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const { data: borrado } = await propio
      .from('lead_tag_assignments').delete().eq('tag_id', TAG_A_UUID).select()
    expect(borrado).toHaveLength(1)
  })
})
