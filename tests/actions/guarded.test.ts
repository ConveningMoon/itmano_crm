import { describe, it, expect, vi, afterEach } from 'vitest'
import { guarded, isNextControlFlow } from '@/lib/actions/guarded'

// El borde entre una server action y el cliente. Dos comportamientos, y el
// segundo es el que se rompe solo: `redirect()` y `notFound()` de Next viajan
// COMO EXCEPCIÓN, así que un catch que se las trague deja la navegación muerta
// en silencio. Cualquiera que toque `guarded` tiene que romper este test antes
// de romper la aplicación.

afterEach(() => { vi.restoreAllMocks() })

/** Un error con la forma con la que Next señaliza redirect/notFound. */
function conDigest(digest: string): Error {
  const e = new Error('control flow')
  ;(e as Error & { digest: string }).digest = digest
  return e
}

describe('isNextControlFlow', () => {
  it('reconoce redirect y notFound', () => {
    expect(isNextControlFlow(conDigest('NEXT_REDIRECT;push;/admin;307;'))).toBe(true)
    expect(isNextControlFlow(conDigest('NEXT_NOT_FOUND'))).toBe(true)
  })

  it('un error corriente no lo es', () => {
    expect(isNextControlFlow(new Error('boom'))).toBe(false)
    expect(isNextControlFlow(conDigest('12345'))).toBe(false)
    expect(isNextControlFlow(null)).toBe(false)
    expect(isNextControlFlow('NEXT_REDIRECT')).toBe(false)
  })
})

describe('guarded', () => {
  it('deja pasar el resultado tal cual cuando todo va bien', async () => {
    const res = await guarded('prueba', async () => ({ ok: true as const, data: { id: 'x' } }))
    expect(res).toEqual({ ok: true, data: { id: 'x' } })
  })

  it('deja pasar un { ok: false } sin tocarlo', async () => {
    const res = await guarded('prueba', async () => ({ ok: false as const, error: 'motivo propio' }))
    expect(res).toEqual({ ok: false, error: 'motivo propio' })
  })

  it('convierte una excepción en { ok: false } con la causa dentro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await guarded('crearSerie', async () => {
      throw new TypeError("Cannot read properties of null (reading 'id')")
    })
    expect(res.ok).toBe(false)
    // La causa TIENE que llegar al usuario: sin ella la pantalla no dice nada,
    // que es el fallo que este helper existe para evitar.
    if (!res.ok) {
      expect(res.error).toContain('crearSerie')
      expect(res.error).toContain("Cannot read properties of null")
    }
  })

  it('registra el error completo en el servidor, no sólo el mensaje', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const boom = new Error('boom')
    await guarded('etiqueta', async () => { throw boom })
    expect(spy).toHaveBeenCalledWith('[action:etiqueta]', boom)
  })

  it('RE-LANZA redirect y notFound en vez de tragárselos', async () => {
    const redirect = conDigest('NEXT_REDIRECT;push;/login;307;')
    await expect(guarded('prueba', async () => { throw redirect })).rejects.toBe(redirect)

    const noEncontrado = conDigest('NEXT_NOT_FOUND')
    await expect(guarded('prueba', async () => { throw noEncontrado })).rejects.toBe(noEncontrado)
  })

  it('también atrapa lo que no es un Error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await guarded('prueba', async () => { throw 'texto suelto' })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain('texto suelto')
  })
})
