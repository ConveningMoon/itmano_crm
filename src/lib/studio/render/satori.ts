import 'server-only'
import satori from 'satori'
import sharp from 'sharp'
import { studioFonts } from './fonts'

// Puente satori → sharp. satori produce SVG a partir de JSX con flexbox; sharp
// lo rasteriza a PNG. Sin navegador, sin Chromium, y determinista.
//
// Restricciones de satori que causan el 90% de los fallos al escribir un
// template:
//   · Un elemento con MÁS DE UN HIJO necesita display:'flex' explícito.
//   · Las imágenes entran como data URI — satori sabe fetchear URLs, pero eso
//     mete red dentro del render y las fotos ya las descargamos antes.
//   · No hay text-overflow fiable: el texto se trunca en JS antes de pasarlo.

export async function renderToPng(
  element: React.ReactElement,
  opts: { width: number; height: number },
): Promise<Buffer> {
  const svg = await satori(element, {
    width:  opts.width,
    height: opts.height,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- reason: el tipo Font de satori pide ArrayBuffer y no exporta el union de forma usable con Buffer
    fonts:  studioFonts() as any,
  })
  return sharp(Buffer.from(svg)).png().toBuffer()
}
