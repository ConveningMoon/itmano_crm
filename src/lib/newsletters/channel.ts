import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import { genPublicId } from './slug'

// El canal de newsletter de un tenant: implícito, único y creado por el sistema.
//
// Antes el usuario creaba "series" y elegía una al escribir cada edición. Nadie
// pidió varias newsletters —ningún portal inmobiliario las tiene— y el precio
// eran cuatro pasos antes de poder escribir: crear la serie, vincularle una
// secuencia, elegirla al crear la edición, y descubrir que el formulario de
// suscripción no apuntaba a nada hasta hacer todo lo anterior.
//
// El canal se queda porque es lo que sostiene el formulario público, la
// atribución de leads y el vínculo con la secuencia. Lo que se retira es que el
// usuario lo vea. Un índice único parcial (migración 110) garantiza que no
// pueda haber dos.

type AdminClient = ReturnType<typeof createAdminClient>

const CHANNEL_COLUMNS = columns('acquisition_channels', [
  'id', 'public_id', 'email_sequence_id',
])

/** Nombre y slug fijos: el usuario no los elige porque no elige el canal. */
const NOMBRE = 'Newsletter'
const SLUG   = 'newsletter'

/**
 * El canal de newsletter del tenant, creándolo si no existe.
 *
 * Idempotente. La carrera de dos creaciones simultáneas la resuelve el índice
 * único: si el insert choca, se relee — no se propaga el error, porque el
 * resultado que el llamador quería (que el canal exista) se cumplió igual.
 */
export async function ensureNewsletterChannel(
  db: AdminClient,
  tenantId: string,
): Promise<{ id: string; publicId: string; sequenceId: string | null } | { error: string }> {
  const leer = async () => {
    const { data } = await db
      .from('acquisition_channels')
      .select(CHANNEL_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('channel_type', 'newsletter')
      .is('archived_at', null)
      .maybeSingle()
    return data as { id: string; public_id: string; email_sequence_id: string | null } | null
  }

  const existente = await leer()
  if (existente) {
    return { id: existente.id, publicId: existente.public_id, sequenceId: existente.email_sequence_id }
  }

  const { data, error } = await db.from('acquisition_channels').insert({
    tenant_id:    tenantId,
    public_id:    genPublicId(),
    channel_type: 'newsletter',
    name:         NOMBRE,
    slug:         SLUG,
  }).select(CHANNEL_COLUMNS).maybeSingle()

  if (error || !data) {
    // Choque del índice único = otro request lo creó primero. Releer es la
    // respuesta correcta, no un error.
    const tras = await leer()
    if (tras) return { id: tras.id, publicId: tras.public_id, sequenceId: tras.email_sequence_id }
    return { error: error?.message ?? 'No se pudo preparar tu newsletter.' }
  }

  // reason: mismo patrón que createSeries en actions.ts — el cliente admin no
  // está tipado contra Database, y un insert().select() encadenado no infiere
  // el resultado como la select-only de `leer()`; el cast intermedio a `any`
  // es lo que permite el cast final a la forma que sí conocemos.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fila = data as any as { id: string; public_id: string; email_sequence_id: string | null }
  return { id: fila.id, publicId: fila.public_id, sequenceId: fila.email_sequence_id }
}

const SEQUENCE_COLUMNS = columns('email_sequences', ['id'])

/**
 * La secuencia de seguimiento de la newsletter, creándola y vinculándola si no
 * la hay. Devuelve su id, o null si no se pudo (best-effort: una edición se
 * puede escribir sin secuencia; lo que no se puede es fallar por esto).
 *
 * Nace VACÍA a propósito y la UI lo dice con un aviso: una secuencia sin pasos
 * no envía nada, y crear correos por nuestra cuenta —con el nombre y la voz de
 * una agencia que no hemos leído— es peor que no crearlos.
 */
export async function ensureNewsletterSequence(
  db: AdminClient,
  tenantId: string,
  channelId: string,
): Promise<string | null> {
  try {
    const { data: canal } = await db
      .from('acquisition_channels')
      .select(columns('acquisition_channels', ['email_sequence_id']))
      .eq('id', channelId).maybeSingle()
    const yaVinculada = (canal as { email_sequence_id: string | null } | null)?.email_sequence_id
    if (yaVinculada) return yaVinculada

    const { data, error } = await db.from('email_sequences').insert({
      tenant_id:       tenantId,
      name:            'Newsletter',
      language:        'es',
      activation_type: 'form',
      active:          true,
    }).select(SEQUENCE_COLUMNS).maybeSingle()
    if (error || !data) return null

    // reason: mismo patrón que ensureNewsletterChannel — insert().select() sin
    // cliente tipado no infiere el resultado.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sequenceId = (data as any as { id: string }).id
    await db.from('acquisition_channels')
      .update({ email_sequence_id: sequenceId })
      .eq('id', channelId).eq('tenant_id', tenantId)
    return sequenceId
  } catch {
    return null
  }
}
