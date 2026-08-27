import { describe, it, expect } from 'vitest'
import { storagePathFor, NEWSLETTER_MEDIA_BUCKET } from '@/lib/newsletters/media'

// `storagePathFor` es el cierre que decide qué se puede borrar. Todo lo que
// devuelva null queda intocable, así que lo que se prueba aquí es sobre todo lo
// que NO debe reconocer: un falso positivo aquí borra el archivo de otro.

const BASE = 'https://xpaixcowvyksgluazwzn.supabase.co/storage/v1/object/public'

describe('storagePathFor', () => {
  it('reconoce una URL pública del bucket de newsletters', () => {
    expect(storagePathFor(`${BASE}/${NEWSLETTER_MEDIA_BUCKET}/tenant-aj/abc.png`))
      .toBe('tenant-aj/abc.png')
  })

  it('decodifica la ruta', () => {
    expect(storagePathFor(`${BASE}/${NEWSLETTER_MEDIA_BUCKET}/tenant-aj/mi%20imagen.png`))
      .toBe('tenant-aj/mi imagen.png')
  })

  it('NO reconoce el marcador relativo del banner de ITMANO', () => {
    // Es un asset estático del repo: no está en storage y no hay nada que borrar.
    expect(storagePathFor('/itmano_banner.webp')).toBeNull()
  })

  it('NO reconoce otros buckets', () => {
    // Las imágenes del Estudio se reutilizan en varias piezas: borrar una
    // porque una edición dejó de usarla destruiría la biblioteca del cliente.
    expect(storagePathFor(`${BASE}/studio-media/tenant-aj/abc.png`)).toBeNull()
    expect(storagePathFor(`${BASE}/property-media/tenant-aj/abc.png`)).toBeNull()
    expect(storagePathFor(`${BASE}/tenant-assets/tenant-aj/logo.png`)).toBeNull()
  })

  it('NO reconoce una URL externa ni basura', () => {
    expect(storagePathFor('https://example.com/foto.png')).toBeNull()
    expect(storagePathFor('')).toBeNull()
    expect(storagePathFor('   ')).toBeNull()
    expect(storagePathFor('javascript:alert(1)')).toBeNull()
  })

  it('NO reconoce la URL del bucket sin objeto detrás', () => {
    expect(storagePathFor(`${BASE}/${NEWSLETTER_MEDIA_BUCKET}/`)).toBeNull()
  })

  it('la ruta conserva el tenant al frente, que es lo que acota el borrado', () => {
    // deleteOrphanMedia exige `ruta.startsWith(tenantId + "/")`: si esto
    // cambiara de forma, un tenant podría alcanzar la carpeta de otro.
    const ruta = storagePathFor(`${BASE}/${NEWSLETTER_MEDIA_BUCKET}/tenant-otro/x.png`)
    expect(ruta).toBe('tenant-otro/x.png')
    expect(ruta!.startsWith('tenant-aj/')).toBe(false)
  })
})
