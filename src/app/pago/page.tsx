import type { Metadata } from 'next'
import { PagoClient } from './pago-client'

// Enlace de pago predeterminado de Paddle: Checkout → Checkout configuration →
// Default payment link = https://<dominio>/pago. Ver pago-client.tsx.
// Página estática: todo lo que depende del enlace ocurre en el navegador.

export const metadata: Metadata = {
  title: 'Pago — ITMANO',
  robots: { index: false, follow: false },
}

export default function PagoPage() {
  return (
    <main className="pago-page">
      <PagoClient />
    </main>
  )
}
