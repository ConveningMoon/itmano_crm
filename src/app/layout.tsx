import type { Metadata } from 'next'
import { MotionProvider } from '@/components/motion/motion-provider'
import './globals.css'

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
    <html lang="es" suppressHydrationWarning>
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  )
}
