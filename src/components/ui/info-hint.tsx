'use client'

import { Popover } from '@base-ui/react/popover'
import { Info } from 'lucide-react'

// Explicación detrás de un icono ⓘ, en vez de un párrafo siempre visible.
//
// Es un Popover y no un Tooltip porque también debe abrirse con un toque en móvil.
// Se renderiza en un portal para que ningún borde ni `overflow` de la tarjeta lo
// corte, y el posicionador lo mantiene dentro de la pantalla.
export function InfoHint({ label = 'Ayuda', children }: {
  label?:   string
  children: React.ReactNode
}) {
  return (
    <Popover.Root>
      <Popover.Trigger openOnHover delay={80} className="info-hint" aria-label={label}>
        <Info size={13} strokeWidth={1.8} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} className="info-hint-positioner">
          <Popover.Popup className="info-hint-popup">{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
