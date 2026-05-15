import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Tu Primera Casa en Virginia · Guía Gratuita',
  description:
    'Descarga gratis la guía completa para familias hispanas que quieren comprar su primera casa en Virginia y North Carolina.',
}

export default function FunnelLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400;1,600&display=swap"
        rel="stylesheet"
      />
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>
      <div
        style={{
          background: '#FAFAF8',
          minHeight: '100vh',
          color: '#1B2F5B',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        {children}
      </div>
    </>
  )
}
