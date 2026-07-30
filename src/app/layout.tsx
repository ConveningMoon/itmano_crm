import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { MotionProvider } from '@/components/motion/motion-provider'
import './globals.css'

// Inter autohospedada: next/font descarga la fuente en build y la sirve desde
// nuestro dominio, así que el navegador no abre conexiones a googleapis/gstatic
// en el camino crítico. `display: swap` mantiene el texto visible mientras carga
// y el fallback ajustado evita el salto de layout al intercambiar.
const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  display: 'swap',
  variable: '--font-inter',
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
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  )
}
