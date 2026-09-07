import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  adminClient,
  asUser,
  TENANT_A_ID,
  USER_A_EMAIL,
  USER_B_EMAIL,
  TEST_PASSWORD,
  createFixtures,
  cleanupFixtures,
} from './setup'

// Las carpetas (migración 115) son PERSONALES, y por eso sus policies no son
// las del resto del repo: no filtran por tenant sino por dueño. Lo que estos
// casos vigilan es justo eso — que la organización de una persona no sea
// visible ni editable por otra del mismo tenant.
//
// Los ids se crean dentro del test porque no forman parte de los fixtures
// compartidos: dependen del uid de cada usuario, que sale de su sesión.

const FOLDER_A_UUID = '00000000-0000-0000-0000-000000000a06'
const FOLDER_B_UUID = '00000000-0000-0000-0000-000000000b06'

async function uidOf(email: string): Promise<string> {
  const client = await asUser(email, TEST_PASSWORD)
  const { data } = await client.auth.getUser()
  const id = data.user?.id
  if (!id) throw new Error(`Sin uid para ${email}: la sesión de prueba no se resolvió`)
  return id
}

describe('RLS: folders', () => {
  beforeAll(async () => {
    await createFixtures()
  })

  afterAll(async () => {
    await adminClient.from('folders').delete().in('id', [FOLDER_A_UUID, FOLDER_B_UUID])
    await cleanupFixtures()
  })

  it('un usuario crea su carpeta y la ve', async () => {
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const owner = await uidOf(USER_A_EMAIL)

    const { error } = await client.from('folders').insert({
      id: FOLDER_A_UUID, tenant_id: TENANT_A_ID, owner_user_id: owner,
      kind: 'source', name: 'Carpeta de A',
    })
    expect(error).toBeNull()

    const { data } = await client.from('folders').select('id').eq('id', FOLDER_A_UUID)
    expect(data).toHaveLength(1)
  })

  it('otro usuario del MISMO tenant no ve esa carpeta', async () => {
    // Es la diferencia con el resto de tablas: aquí compartir tenant no basta.
    const client = await asUser(USER_B_EMAIL, TEST_PASSWORD)
    const { data } = await client.from('folders').select('id').eq('id', FOLDER_A_UUID)
    expect(data).toHaveLength(0)
  })

  it('nadie puede crear una carpeta a nombre de otro', async () => {
    const client = await asUser(USER_B_EMAIL, TEST_PASSWORD)
    const ajeno = await uidOf(USER_A_EMAIL)

    const { error } = await client.from('folders').insert({
      id: FOLDER_B_UUID, tenant_id: TENANT_A_ID, owner_user_id: ajeno,
      kind: 'source', name: 'Carpeta impostora',
    })
    expect(error).not.toBeNull()
  })

  it('no se puede renombrar ni borrar la carpeta de otro', async () => {
    const client = await asUser(USER_B_EMAIL, TEST_PASSWORD)

    const { data: updated } = await client
      .from('folders').update({ name: 'Secuestrada' }).eq('id', FOLDER_A_UUID).select()
    expect(updated).toHaveLength(0)

    const { data: deleted } = await client
      .from('folders').delete().eq('id', FOLDER_A_UUID).select()
    expect(deleted).toHaveLength(0)

    const { data: sigue } = await adminClient.from('folders').select('name').eq('id', FOLDER_A_UUID)
    expect(sigue).toHaveLength(1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((sigue as any)[0].name).toBe('Carpeta de A')
  })

  it('un elemento no puede estar dos veces en carpetas del mismo usuario', async () => {
    // El índice único parcial de la 115: mover es "sacar y volver a poner", y
    // sin él un doble click dejaría la fuente en dos carpetas a la vez.
    const client = await asUser(USER_A_EMAIL, TEST_PASSWORD)
    const owner = await uidOf(USER_A_EMAIL)
    const channelId = '00000000-0000-0000-0000-000000000a01' // CHANNEL_A_UUID (fixture)

    const fila = { folder_id: FOLDER_A_UUID, owner_user_id: owner, channel_id: channelId }
    const { error: primera } = await client.from('folder_items').insert(fila)
    expect(primera).toBeNull()

    const { error: repetida } = await client.from('folder_items').insert(fila)
    expect(repetida).not.toBeNull()

    await adminClient.from('folder_items').delete().eq('folder_id', FOLDER_A_UUID)
  })
})
