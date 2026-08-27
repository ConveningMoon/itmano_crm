import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { columns } from '@/lib/supabase/columns'
import type { NewsletterContent } from './content'

// Limpieza del bucket `newsletter-media`.
//
// Cambiar la portada de una edición subía la nueva y dejaba la vieja donde
// estaba: cada iteración sobre la misma edición —y generar portadas con IA
// invita a iterar— dejaba un archivo huérfano que ya no aparece en ninguna
// pantalla y que nadie va a borrar nunca. Se paga almacenamiento por una
// imagen que no existe para el producto.
//
// Borrar es irreversible, así que este módulo es deliberadamente cobarde: sólo
// toca un objeto cuando puede demostrar las tres cosas.

export const NEWSLETTER_MEDIA_BUCKET = 'newsletter-media'

/**
 * La ruta del objeto dentro del bucket, o null si esa URL no es nuestra.
 *
 * Devuelve null —y por tanto no se borra nada— para:
 *   · el marcador `/itmano_banner.webp`, que es un asset estático del repo;
 *   · las imágenes del Estudio, que viven en OTRO bucket y se reutilizan en
 *     varias piezas: borrar una porque una edición dejó de usarla destruiría
 *     un activo de la biblioteca del cliente;
 *   · cualquier URL externa que alguien pegue a mano.
 */
export function storagePathFor(url: string, bucket = NEWSLETTER_MEDIA_BUCKET): string | null {
  if (typeof url !== 'string' || !url.trim()) return null
  let parsed: URL
  try {
    parsed = new URL(url.trim())
  } catch {
    return null   // ruta relativa: el marcador, o algo que no es una URL
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

  const marca = `/storage/v1/object/public/${bucket}/`
  const i = parsed.pathname.indexOf(marca)
  if (i === -1) return null

  const ruta = decodeURIComponent(parsed.pathname.slice(i + marca.length))
  return ruta || null
}

const COVER_COLUMNS   = columns('newsletter_editions', ['id'])
const CONTENT_COLUMNS = columns('newsletter_editions', ['id'])

/**
 * ¿Queda alguien usando esta imagen?
 *
 * Mira las dos formas en que una edición puede referenciarla: como portada y
 * dentro de su contenido (un bloque de imagen puede apuntar al mismo archivo
 * que la portada — pasa en cuanto alguien reutiliza la que ya subió). Si
 * cualquiera de las dos da un resultado, no se borra.
 */
async function sigueEnUso(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  url: string,
  exceptEditionId: string,
): Promise<boolean> {
  const { data: portadas, error: e1 } = await db
    .from('newsletter_editions')
    .select(COVER_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('cover_image_url', url)
    .neq('id', exceptEditionId)
    .limit(1)
  // Ante la duda, NO se borra: un error de lectura no puede convertirse en una
  // pérdida de datos.
  if (e1) return true
  if ((portadas ?? []).length > 0) return true

  // `content` es jsonb; el filtro por texto lo resuelve Postgres sin traerse
  // todas las ediciones al servidor de Node.
  const { data: enContenido, error: e2 } = await db
    .from('newsletter_editions')
    .select(CONTENT_COLUMNS)
    .eq('tenant_id', tenantId)
    .neq('id', exceptEditionId)
    .like('content', `%${url}%`)
    .limit(1)
  if (e2) return true
  return (enContenido ?? []).length > 0
}

/**
 * Borra del bucket una imagen que una edición ha dejado de usar.
 *
 * Best-effort a propósito: la edición ya se guardó, y no poder limpiar un
 * archivo no puede tumbar la operación que el usuario acaba de completar. Un
 * huérfano cuesta unos céntimos; un error en pantalla al guardar cuesta la
 * confianza.
 *
 * Las tres condiciones, todas obligatorias:
 *   1. la URL apunta a `newsletter-media` (`storagePathFor`);
 *   2. la ruta empieza por el `tenant_id` de quien borra — el bucket es común a
 *      todos los tenants y una URL manipulada no puede alcanzar la carpeta de
 *      otro;
 *   3. ninguna otra edición del tenant la sigue usando.
 */
export async function deleteOrphanMedia(
  db: ReturnType<typeof createAdminClient>,
  tenantId: string,
  url: string | null | undefined,
  exceptEditionId: string,
): Promise<void> {
  if (!url) return
  const ruta = storagePathFor(url)
  if (!ruta) return
  // El prefijo lo escribe el propio uploader (`${ctx.tenant_id}/<uuid>.<ext>`),
  // así que esto es una igualdad exacta de carpeta, no una heurística.
  if (!ruta.startsWith(`${tenantId}/`)) return

  try {
    if (await sigueEnUso(db, tenantId, url, exceptEditionId)) return
    await db.storage.from(NEWSLETTER_MEDIA_BUCKET).remove([ruta])
  } catch (e) {
    console.error('[newsletter-media] no se pudo limpiar', ruta, e)
  }
}

/**
 * Todas las imágenes de una edición: la portada y las de sus bloques.
 *
 * Deduplicadas, porque reutilizar la portada dentro del cuerpo es lo normal en
 * cuanto alguien vuelve a elegir una imagen que ya subió — y borrar dos veces
 * la misma ruta hace que el segundo intento parezca un fallo.
 */
export function editionMediaUrls(
  coverImageUrl: string | null | undefined,
  content: NewsletterContent | null,
): string[] {
  const urls = new Set<string>()
  if (coverImageUrl) urls.add(coverImageUrl)
  for (const bloque of content?.blocks ?? []) {
    if (bloque.type === 'image' && bloque.url) urls.add(bloque.url)
  }
  return [...urls]
}
