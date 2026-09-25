'use client'

import { useFormStatus } from 'react-dom'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

// Botón de envío para un <form action={serverAction}>: se deshabilita y muestra
// el spinner compartido (.loading-spinner de globals.css) mientras la action
// está en vuelo. Va dentro del <form>, que es de donde useFormStatus lee.
//
// Existe para los formularios de Server Components (cerrar sesión, "Entrar al
// CRM" del centro de control), que no pueden usar useTransition por sí mismos.
// El estilo lo pone quien lo usa; esto sólo decide cuándo se ve el spinner.
export function PendingSubmitButton({
  children,
  pendingLabel,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode
  /** Texto que reemplaza al contenido mientras se envía (opcional). */
  pendingLabel?: ReactNode
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      {...props}
      disabled={pending || props.disabled}
      aria-busy={pending}
      style={{ ...props.style, opacity: pending ? 0.7 : props.style?.opacity, cursor: pending ? 'progress' : props.style?.cursor }}
    >
      {pending ? (
        <>
          <span aria-hidden className="loading-spinner" />
          {pendingLabel ?? children}
        </>
      ) : children}
    </button>
  )
}
