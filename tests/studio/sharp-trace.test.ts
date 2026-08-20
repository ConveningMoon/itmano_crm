import { describe, it, expect } from 'vitest'
import nextConfig from '../../next.config'

// Guardia del fallo de sharp en producción.
//
// sharp carga `@img/sharp-<plataforma>` con un require dinámico, y ese paquete
// abre su libvips (`libvips-cpp.so`) con **dlopen** desde el binario nativo. Un
// dlopen no es un require, así que el trazador de Next no puede verlo: el
// `.node` viaja al bundle y su `.so` se queda fuera. El build sale verde, el
// lockfile es correcto, y la función revienta al primer uso con
// "ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file".
//
// En Windows no se reproduce —ahí libvips va DENTRO del paquete de la
// plataforma— así que este test es lo único que vigila el arreglo desde local.
//
// La lista salió de mirar qué `.nft.json` del build mencionan
// `node_modules/sharp/`. Si una ruta nueva empieza a usar sharp y no se añade
// aquí ni en next.config.ts, fallará igual de silenciosamente.

const RUTAS_QUE_USAN_SHARP = [
  '/admin',                    // panel con miniaturas de marca
  '/admin/carousels',          // compositor de diapositivas
  '/properties',               // conversión a WebP al subir
  '/properties/[id]',
  '/settings',
  '/studio',                   // normalizePhoto en cada pieza
  '/studio/plantillas',        // miniatura de la plantilla al guardar
  '/api/cron/carousel-render',
  '/api/properties/media',
]

describe('los binarios nativos de sharp viajan al bundle', () => {
  const incluidos = nextConfig.outputFileTracingIncludes ?? {}

  it.each(RUTAS_QUE_USAN_SHARP)('%s incluye node_modules/@img', ruta => {
    const patrones = incluidos[ruta] ?? []
    expect(
      patrones.some(p => p.includes('@img')),
      `${ruta} usa sharp pero no traza @img: su libvips no llegaria al bundle`,
    ).toBe(true)
  })

  it('la ruta de render NO necesita sharp, y no carga con sus binarios', () => {
    // Chrome no usa sharp: si algun dia aparece @img aqui, es que alguien metio
    // sharp en el camino del render y conviene saberlo.
    const patrones = incluidos['/api/studio/render'] ?? []
    expect(patrones.some(p => p.includes('@img'))).toBe(false)
  })
})
