import { NextResponse } from 'next/server'
import { z } from 'zod'
import { renderDocumentToPng, studioFontFaceCss } from '@/lib/studio/render/chrome'

// El ÚNICO sitio del proyecto que importa Chromium. Vive aparte para que sus
// ~50 MB y su arranque en frío no viajen en el bundle de /studio ni en el del
// editor: quien solo entra a mirar la biblioteca no los paga.
//
// La llama el propio servidor (generar, recomponer, miniatura), nunca el
// navegador — por eso el guardia es un secreto compartido y no la sesión.

export const runtime = 'nodejs'
export const maxDuration = 60

const schema = z.object({
  document: z.string().min(1).max(20_000_000),
  width:    z.number().int().min(1).max(4000),
  height:   z.number().int().min(1).max(4000),
})

export async function POST(request: Request) {
  const secret = process.env.STUDIO_RENDER_SECRET
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 })
  }

  try {
    // Las fuentes las pone la ruta, no el llamador: los .ttf viven en el bundle
    // de ESTA función (outputFileTracingIncludes) y nadie más tiene por qué
    // cargar con sus bytes. El documento llega con `fontFaceCss: ''` y sale con
    // las @font-face delante de todo lo demás.
    const withFonts = parsed.data.document.replace('<style>', `<style>${studioFontFaceCss()}`)
    const png = await renderDocumentToPng(withFonts, {
      width: parsed.data.width, height: parsed.data.height,
    })
    return new NextResponse(new Uint8Array(png), {
      headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Error desconocido'
    console.error(JSON.stringify({ service: 'studio', step: 'render', message }))
    return NextResponse.json({ error: `No se pudo renderizar: ${message}` }, { status: 500 })
  }
}
