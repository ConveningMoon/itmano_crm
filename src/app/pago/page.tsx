import type { Metadata } from 'next'
import Image from 'next/image'
import { LockKeyhole } from 'lucide-react'
import { PagoClient } from './pago-client'

// Checkout inline de Paddle y enlace de pago predeterminado: Checkout →
// Checkout configuration → Default payment link = https://<dominio>/pago.
// Ver pago-client.tsx.
//
// Página estática: el shell (marca, marco y skeletons) sale prerenderizado y
// todo lo que depende del enlace (`?_ptxn=`) ocurre en el navegador. No lee
// sesión ni base: quien llega desde un correo de Paddle puede no tener sesión.

export const metadata: Metadata = {
  title: 'Pago — ITMANO',
  robots: { index: false, follow: false },
}

export default function PagoPage() {
  return (
    <main className="pago-page">
      <header className="pago-header">
        <span className="pago-brand">
          <Image
            src="/itmano_logo.webp"
            alt=""
            width={28}
            height={28}
            priority
            className="img-tint-gold-glow"
          />
          ITMANO
        </span>
        <span className="pago-secure">
          <LockKeyhole size={13} aria-hidden="true" />
          Pago seguro
        </span>
      </header>
      <PagoClient />
    </main>
  )
}
