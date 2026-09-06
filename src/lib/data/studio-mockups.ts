import 'server-only'
import sharp from 'sharp'
import { createAdminClient } from '@/lib/supabase/admin'
import { STUDIO_BUCKET, publicUrl } from './studio'
import { mockupSlot, type MockupMap } from '@/lib/studio/mockups'

// Las imágenes de ejemplo que se suben desde el editor. Viven en el bucket que
// ya guarda las miniaturas de las plantillas, bajo `mockups/`.
//
// No hay tabla: el nombre del archivo ES la clave del hueco, así que listar el
// prefijo basta para saber qué hay. Una tabla para seis filas de metadatos que
// ya están en el nombre sería una migración a cambio de nada.

const PREFIX = 'mockups'

/** El bucket sirve por URL fija, así que sin esto una imagen reemplazada
 *  seguiría viéndose la vieja hasta que caduque la caché del navegador. */
function conVersion(url: string, version: string): string {
  return `${url}?v=${encodeURIComponent(version)}`
}

function rutaDe(key: string, keepsAlpha: boolean): string {
  return `${PREFIX}/${key}.${keepsAlpha ? 'png' : 'jpg'}`
}

/**
 * Lo que hay subido, por clave. Lo que falte simplemente no aparece: quien
 * llama lo cruza con las de reserva vía `resolveMockups`.
 */
export async function listMockupOverrides(): Promise<MockupMap> {
  const { data, error } = await createAdminClient().storage
    .from(STUDIO_BUCKET).list(PREFIX, { limit: 100 })
  // Un fallo leyendo el bucket no puede dejar sin editor a nadie: se cae a las
  // de reserva, que es exactamente lo que había antes de esta función.
  if (error || !data) return {}

  const out: MockupMap = {}
  for (const archivo of data) {
    const key = archivo.name.replace(/\.(png|jpg)$/, '')
    if (!mockupSlot(key)) continue
    const url = publicUrl(`${PREFIX}/${archivo.name}`)
    if (url) out[key] = conVersion(url, archivo.updated_at ?? archivo.created_at ?? '1')
  }
  return out
}

/**
 * Guarda una imagen de ejemplo y devuelve su URL ya versionada.
 *
 * El logo y el retrato van a PNG para conservar el alfa; las fotos a JPEG, que
 * es donde el peso del data URI importa en el render. Se reduce a 1600px: son
 * material de diseño, no el original de nadie.
 */
export async function saveMockup(key: string, entrada: Buffer): Promise<string> {
  const slot = mockupSlot(key)
  if (!slot) throw new Error('Ese hueco de imagen no existe')

  const base = sharp(entrada).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
  const cuerpo = slot.keepsAlpha
    ? await base.png().toBuffer()
    : await base.jpeg({ quality: 86 }).toBuffer()

  const ruta = rutaDe(key, slot.keepsAlpha)
  const tipo = slot.keepsAlpha ? 'image/png' : 'image/jpeg'
  const { error } = await createAdminClient().storage.from(STUDIO_BUCKET)
    .upload(ruta, new Blob([new Uint8Array(cuerpo)], { type: tipo }), {
      contentType: tipo, upsert: true,
    })
  if (error) throw new Error(`No se pudo subir la imagen: ${error.message}`)

  const url = publicUrl(ruta)
  if (!url) throw new Error('La imagen se subió pero no se pudo resolver su URL')
  return conVersion(url, String(Date.now()))
}

/** Quita la subida y devuelve el hueco a la imagen de reserva del repo. */
export async function deleteMockup(key: string): Promise<void> {
  const slot = mockupSlot(key)
  if (!slot) throw new Error('Ese hueco de imagen no existe')
  const { error } = await createAdminClient().storage
    .from(STUDIO_BUCKET).remove([rutaDe(key, slot.keepsAlpha)])
  if (error) throw new Error(`No se pudo quitar la imagen: ${error.message}`)
}
