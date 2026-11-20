import type { Metadata } from 'next'
import localFont from 'next/font/local'
import { MotionProvider } from '@/components/motion/motion-provider'
import './globals.css'

// Inter (OFL, ver src/app/fonts/OFL-Inter.txt) versionada en el repo y servida
// desde nuestro dominio. No usamos next/font/google: descarga la fuente durante
// el build y, cuando Google Fonts falla, el build de Vercel también falla (deploy
// de producción del 17 nov 2026). `display: swap` mantiene el texto visible y el
// fallback ajustado evita el salto de layout al intercambiar.
const inter = localFont({
  src: './fonts/inter-latin.woff2',
  weight: '300 600',
  display: 'swap',
  variable: '--font-inter',
  declarations: [{ prop: 'unicode-range', value: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' }],
})

// Latín extendido (ł, ő, ș, ğ…) en una familia aparte que sólo se descarga si la
// página tiene esos caracteres. Va antes que --font-inter en --font-sans: por su
// unicode-range el navegador la salta para el resto del texto.
const interExt = localFont({
  src: './fonts/inter-latin-ext.woff2',
  weight: '300 600',
  display: 'swap',
  variable: '--font-inter-ext',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' }],
})

export const metadata: Metadata = {
  // Base para URLs absolutas de OG/Twitter (el layout de marketing define su
  // propio metadata; esto cubre el resto y evita el fallback a localhost).
  metadataBase: new URL('https://app.itmano.com'),
  title: 'ITMANO CRM',
  description: 'Growth Partner Platform for Real Estate',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={`${inter.variable} ${interExt.variable}`} suppressHydrationWarning>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  )
}
