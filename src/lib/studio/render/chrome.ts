import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer, { type Browser } from 'puppeteer-core'
import chromium from '@sparticuz/chromium'
import { fontFaceCssFromData } from '../fonts/catalog'

// Chrome sin interfaz: el mismo motor que enseña la vista previa del editor.
//
// Dos cierres, y el que importa es el segundo:
//   · JavaScript desactivado — la plantilla es declarativa y no lo necesita.
//   · SIN RED. Solo pasan data: y about:blank. Las fotos ya entran codificadas
//     y las fuentes van dentro del documento, así que la página no tiene nada
//     que pedir; dejar la puerta abierta sería regalar superficie a cambio de
//     nada.
//
// El navegador se reutiliza entre invocaciones: en Fluid Compute la misma
// instancia atiende varias peticiones y relanzar Chrome en cada una tira dos
// segundos a la basura.

let browserPromise: Promise<Browser> | null = null

function localExecutable(): string | undefined {
  return process.env.CHROME_EXECUTABLE_PATH || undefined
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const local = localExecutable()
      return puppeteer.launch({
        args: local ? [] : chromium.args,
        executablePath: local ?? (await chromium.executablePath()),
        headless: true,
      })
    })().catch(err => {
      // Sin esto, un fallo de arranque deja la promesa rechazada cacheada y
      // TODAS las peticiones siguientes fallan con el error de la primera.
      browserPromise = null
      throw err
    })
  }
  return browserPromise
}

/** Las @font-face con los bytes dentro. Lee de public/, que la ruta traza. */
export function studioFontFaceCss(): string {
  const dir = join(process.cwd(), 'public', 'studio', 'fonts')
  return fontFaceCssFromData(file => readFileSync(join(dir, file)))
}

export async function renderDocumentToPng(
  document: string,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setJavaScriptEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', req => {
      const url = req.url()
      if (url.startsWith('data:') || url.startsWith('about:')) void req.continue()
      else void req.abort()
    })

    await page.setViewport({ width: opts.width, height: opts.height, deviceScaleFactor: 1 })
    await page.setContent(document, { waitUntil: 'load' })
    const shot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: opts.width, height: opts.height },
    })
    return Buffer.from(shot)
  } finally {
    await page.close()
  }
}
