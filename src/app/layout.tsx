import type { Metadata } from 'next'
import { MotionProvider } from '@/components/motion/motion-provider'
import './globals.css'

export const metadata: Metadata = {
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
