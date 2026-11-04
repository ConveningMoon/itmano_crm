'use client'

import { useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { Info } from 'lucide-react'

// Explicación detrás de un icono ⓘ, en vez de un párrafo siempre visible.
//
// Es un Popover y no un Tooltip porque también debe abrirse con un toque en móvil.
// Se renderiza en un portal para que ningún borde ni `overflow` de la tarjeta lo
// corte, y el posicionador lo mantiene dentro de la pantalla.
//
// El estado es controlado porque el Popover sólo abre con hover y clic: quien navega
// con teclado también debe leerlo al llegar con Tab. Se mira :focus-visible para que
// el foco de un clic de ratón no compita con el clic mismo.
export function InfoHint({ label = 'Ayuda', children }: {
  label?:   string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover
        delay={80}
        className="info-hint"
        aria-label={label}
        onFocus={e => { if (e.currentTarget.matches(':focus-visible')) setOpen(true) }}
        onBlur={() => setOpen(false)}
      >
        <Info size={13} strokeWidth={1.8} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} className="info-hint-positioner">
          <Popover.Popup className="info-hint-popup" initialFocus={false} finalFocus={false}>{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
