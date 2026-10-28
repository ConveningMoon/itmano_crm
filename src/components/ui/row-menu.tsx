'use client'

import Link from 'next/link'
import { Menu } from '@base-ui/react/menu'
import { ChevronRight, MoreHorizontal } from 'lucide-react'

// Menú ⋯ de una fila o tarjeta. Sustituye a las filas de iconos sueltos: la
// acción principal es el clic en la fila y lo demás vive aquí, con teclado,
// foco y cierre por Escape que da Base UI. Se pinta en un portal, así que el
// `overflow: hidden` de las tablas no lo recorta.

export type MenuEntry =
  | { type: 'item'; label: string; icon?: React.ReactNode; onSelect?: () => void; href?: string
      tone?: 'danger'; disabled?: boolean; current?: boolean; external?: boolean }
  | { type: 'submenu'; label: string; icon?: React.ReactNode; entries: MenuEntry[] }
  | { type: 'label'; label: string }
  | { type: 'separator' }

function Entries({ entries }: { entries: MenuEntry[] }) {
  return (
    <>
      {entries.map((entry, i) => {
        switch (entry.type) {
          case 'separator':
            return <Menu.Separator key={i} className="menu-sep" />
          case 'label':
            return <div key={i} className="menu-label">{entry.label}</div>
          case 'submenu':
            return (
              <Menu.SubmenuRoot key={i}>
                <Menu.SubmenuTrigger className="menu-item">
                  {entry.icon}
                  {entry.label}
                  <span className="menu-item-end"><ChevronRight size={13} /></span>
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner className="menu-positioner" sideOffset={6} alignOffset={-4}>
                    <Menu.Popup className="menu-popup" style={{ maxHeight: 320, overflowY: 'auto' }}>
                      <Entries entries={entry.entries} />
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
            )
          case 'item':
            return entry.href ? (
              <Menu.LinkItem
                key={i}
                className="menu-item"
                data-tone={entry.tone}
                render={entry.external
                  ? <a href={entry.href} target="_blank" rel="noopener noreferrer" />
                  : <Link href={entry.href} />}
              >
                {entry.icon}
                {entry.label}
              </Menu.LinkItem>
            ) : (
              <Menu.Item
                key={i}
                className="menu-item"
                data-tone={entry.tone}
                data-current={entry.current ? '' : undefined}
                disabled={entry.disabled}
                onClick={entry.onSelect}
              >
                {entry.icon}
                {entry.label}
              </Menu.Item>
            )
        }
      })}
    </>
  )
}

export function RowMenu({ entries, label }: {
  entries: MenuEntry[]
  /** Nombre del elemento, sólo para lectores de pantalla: "Acciones de X". */
  label:   string
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="icon-btn"
        aria-label={`Acciones de ${label}`}
        // El clic no debe llegar a la fila (que navega al detalle).
        onClick={e => e.stopPropagation()}
      >
        <MoreHorizontal size={16} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="menu-positioner" side="bottom" align="end" sideOffset={6}>
          <Menu.Popup className="menu-popup" onClick={e => e.stopPropagation()}>
            <Entries entries={entries} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}

/** Menú con un botón propio (p. ej. "Nueva fuente ▾"). */
export function ButtonMenu({ entries, trigger }: {
  entries: MenuEntry[]
  trigger: React.ReactNode
}) {
  return (
    <Menu.Root>
      <Menu.Trigger className="btn btn-primary">{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="menu-positioner" side="bottom" align="end" sideOffset={6}>
          <Menu.Popup className="menu-popup">
            <Entries entries={entries} />
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
