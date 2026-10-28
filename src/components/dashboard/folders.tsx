'use client'

import { useEffect, useState, useSyncExternalStore, useTransition } from 'react'
import { Check, Folder as FolderIcon, FolderInput, FolderPlus, Pencil, Trash2, ChevronRight } from 'lucide-react'
import type { Folder, FolderKind } from '@/lib/data/folders'
import { createFolder, createFolderAndMove, renameFolder, deleteFolder, moveToFolder } from '@/app/(dashboard)/folder-actions'
import { ModalShell } from '@/components/motion/modal-shell'
import { RowMenu, type MenuEntry } from '@/components/ui/row-menu'

// ─── Carpetas: la UI compartida entre /sources y /emails ──────────────────────
//
// Las dos secciones agrupan cosas distintas pero con exactamente los mismos
// gestos: crear una carpeta, plegarla, renombrarla, borrarla y mover un
// elemento. Vive aquí para que no haya dos copias que se separen con el tiempo.
//
// Las carpetas nacen CERRADAS: la lista abre limpia y cada quien despliega lo
// que quiere ver. Qué carpetas dejó abiertas es una preferencia de vista de cada
// navegador (localStorage): guardarla en la base sería un viaje al servidor por
// cada click en una flecha.

type ActionResult = { ok: true } | { ok: false; error: string }

const ERROR_BOX: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--accent-coral)',
  padding: '8px 10px',
  background: 'color-mix(in srgb, var(--accent-coral) 10%, transparent)',
  borderRadius: '8px',
}

// ─── Modal de nombre (crear y renombrar) ──────────────────────────────────────

// El formulario vive DENTRO de ModalShell: AnimatePresence conserva este hijo
// durante la salida y lo desmonta al terminar, así que cada apertura empieza con
// el estado limpio sin tener que reiniciarlo a mano.
function NameForm({ title, initial, confirmLabel, onConfirm, onClose }: {
  title:        string
  initial:      string
  confirmLabel: string
  onConfirm:    (name: string) => Promise<ActionResult>
  onClose:      () => void
}) {
  const [name,    setName]  = useState(initial)
  const [error,   setError] = useState<string | null>(null)
  const [pending, start]    = useTransition()

  // Un <form> de verdad y no un onKeyDown: así Enter envía por comportamiento
  // nativo del navegador, que es lo que espera cualquiera que escriba el nombre
  // y pulse Enter sin tocar el ratón.
  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    setError(null)
    start(async () => {
      const res = await onConfirm(name)
      if (!res.ok) { setError(res.error); return }
      onClose()
    })
  }

  return (
    <form onSubmit={submit} style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>{title}</div>
      <input
        value={name}
        autoFocus
        maxLength={60}
        onChange={e => setName(e.target.value)}
        aria-label="Nombre de la carpeta"
        placeholder="Campañas 2026"
        style={{
          width: '100%', height: '40px', padding: '0 12px', fontSize: '14px',
          color: 'var(--text-primary)', background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)', borderRadius: '8px', outline: 'none',
        }}
      />
      {error && <div role="alert" style={ERROR_BOX}>{error}</div>}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button type="button" onClick={onClose} className="btn btn-ghost">Cancelar</button>
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending && <span className="loading-spinner" aria-hidden="true" />}
          {pending ? 'Guardando…' : confirmLabel}
        </button>
      </div>
    </form>
  )
}

// ─── Botón "Nueva carpeta" ────────────────────────────────────────────────────

export function NewFolderButton({ kind }: { kind: FolderKind }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-ghost">
        <FolderPlus size={14} />
        Nueva carpeta
      </button>
      <ModalShell open={open} onClose={() => setOpen(false)} maxWidth={420}>
        <NameForm
          title="Nueva carpeta"
          initial=""
          confirmLabel="Crear"
          // createFolder ya incluye el RSC actualizado en la respuesta de la
          // Server Action. Otro router.refresh duplicaba toda la lectura.
          onConfirm={name => createFolder(kind, name)}
          onClose={() => setOpen(false)}
        />
      </ModalShell>
    </>
  )
}

// ─── Cabecera plegable de una carpeta ─────────────────────────────────────────

// localStorage es un sistema externo a React, así que se lee con
// `useSyncExternalStore` y no con un efecto que haga setState: el snapshot del
// servidor es siempre "cerrada", el del cliente sale del storage, y React se
// encarga de que la hidratación no choque.
const openListeners = new Set<() => void>()

function notifyOpen() {
  for (const listener of openListeners) listener()
}

function subscribeOpen(listener: () => void) {
  openListeners.add(listener)
  // Otra pestaña del mismo usuario también abre carpetas: `storage` avisa.
  window.addEventListener('storage', listener)
  return () => {
    openListeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

// Clave propia (no la `folder-collapsed:` de antes): quien alguna vez desplegó
// una carpeta con el esquema viejo la tenía guardada como "abierta", y eso
// anulaba el nuevo valor por defecto.
function useOpen(folderId: string): [boolean, (v: boolean) => void] {
  const storageKey = `folder-open:${folderId}`

  const open = useSyncExternalStore(
    subscribeOpen,
    () => {
      try {
        return window.localStorage.getItem(storageKey) === '1'
      } catch { return false } // modo privado o storage bloqueado: cerrada
    },
    () => false,
  )

  // El HTML del servidor no puede saber qué abrió este navegador, así que la
  // carpeta se hidrata cerrada y el snapshot del cliente no coincide con el
  // del servidor. Este aviso al montar hace que React vuelva a leer el storage
  // y aplique la preferencia. Va en un macrotask y no en el cuerpo del efecto
  // para no competir con la hidratación; `requestAnimationFrame` no sirve aquí
  // porque no corre en una pestaña en segundo plano.
  useEffect(() => {
    const id = setTimeout(notifyOpen, 0)
    return () => clearTimeout(id)
  }, [])

  function update(value: boolean) {
    try {
      window.localStorage.setItem(storageKey, value ? '1' : '0')
    } catch { /* la preferencia no se recuerda, pero la vista debe reaccionar */ }
    notifyOpen()
  }

  return [open, update]
}

export function FolderGroup({ folder, count, children }: {
  folder:   Folder
  count:    number
  children: React.ReactNode
}) {
  const [open, setOpen] = useOpen(folder.id)
  const [modal, setModal] = useState<'rename' | 'delete' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start]  = useTransition()

  function handleDelete() {
    setError(null)
    start(async () => {
      const res = await deleteFolder(folder.id)
      if (!res.ok) { setError(res.error); return }
      setModal(null)
    })
  }

  return (
    <section style={{ marginBottom: '16px' }}>
      <div className="folder-head">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="folder-toggle"
        >
          <ChevronRight size={15} className="folder-chevron" />
          <FolderIcon size={16} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />
          <span style={{ fontSize: '14px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folder.name}
          </span>
          <span className="pill" data-tone="mute" style={{ height: '20px', padding: '0 8px' }}>{count}</span>
        </button>

        <RowMenu
          label={folder.name}
          entries={[
            { type: 'item', label: 'Renombrar', icon: <Pencil size={14} />, onSelect: () => setModal('rename') },
            { type: 'separator' },
            { type: 'item', label: 'Eliminar carpeta', icon: <Trash2 size={14} />, tone: 'danger', onSelect: () => setModal('delete') },
          ]}
        />
      </div>

      {open && (
        <div className="folder-body">
          {count === 0
            ? <div className="dt" style={{ padding: '20px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Carpeta vacía. Usa «Mover a carpeta» en el menú de una fila para traer algo aquí.
              </div>
            : children}
        </div>
      )}

      <ModalShell open={modal === 'rename'} onClose={() => setModal(null)} maxWidth={420}>
        <NameForm
          title="Renombrar carpeta"
          initial={folder.name}
          confirmLabel="Guardar"
          onConfirm={name => renameFolder(folder.id, name)}
          onClose={() => setModal(null)}
        />
      </ModalShell>

      <ModalShell open={modal === 'delete'} onClose={() => setModal(null)} maxWidth={420}>
        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>
            Eliminar «{folder.name}»
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Se elimina sólo la carpeta. Lo que hay dentro no se borra: vuelve a la lista sin carpeta.
          </div>
          {error && <div role="alert" style={ERROR_BOX}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button onClick={() => setModal(null)} className="btn btn-ghost">Cancelar</button>
            <button onClick={handleDelete} disabled={pending} className="btn btn-danger">
              {pending && <span className="loading-spinner" aria-hidden="true" />}
              {pending ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        </div>
      </ModalShell>
    </section>
  )
}

// ─── Mover un elemento a una carpeta ──────────────────────────────────────────

/**
 * Entradas de menú para mover un elemento de carpeta, más el modal de «Nueva
 * carpeta». El modal se devuelve aparte porque el menú se desmonta al elegir una
 * opción: si viviera dentro, «Crear y mover» se cerraría antes de terminar.
 * Quien lo usa pinta `modal` fuera del menú (junto a la fila).
 */
export function useFolderMenu(kind: FolderKind, itemId: string, folders: Folder[], currentFolderId: string | null) {
  const [creating, setCreating] = useState(false)
  const [pending, start] = useTransition()

  function move(folderId: string | null) {
    start(async () => { await moveToFolder(kind, itemId, folderId) })
  }

  const entry: MenuEntry = {
    type: 'submenu',
    label: 'Mover a carpeta',
    icon: <FolderInput size={14} />,
    entries: [
      { type: 'item', label: 'Sin carpeta', current: currentFolderId === null,
        disabled: currentFolderId === null, onSelect: () => move(null),
        icon: currentFolderId === null ? <Check size={14} /> : <span style={{ width: 14 }} /> },
      ...folders.map((f): MenuEntry => ({
        type: 'item', label: f.name, current: f.id === currentFolderId,
        disabled: f.id === currentFolderId, onSelect: () => move(f.id),
        icon: f.id === currentFolderId ? <Check size={14} /> : <FolderIcon size={14} />,
      })),
      { type: 'separator' },
      // Crear y mover en un gesto: quien abre este menú ya sabe dónde quiere
      // el elemento, y obligarle a crear la carpeta arriba y volver aquí
      // convertía una acción en tres.
      { type: 'item', label: 'Nueva carpeta…', icon: <FolderPlus size={14} />, onSelect: () => setCreating(true) },
    ],
  }

  const modal = (
    <ModalShell open={creating} onClose={() => setCreating(false)} maxWidth={420}>
      <NameForm
        title="Nueva carpeta"
        initial=""
        confirmLabel="Crear y mover"
        // Una sola Server Action: Next despacha las actions secuencialmente,
        // así que crear y luego mover obligaba a esperar dos RSC completos.
        onConfirm={name => createFolderAndMove(kind, itemId, name)}
        onClose={() => setCreating(false)}
      />
    </ModalShell>
  )

  // `pending` deja a la fila atenuarse mientras la Server Action termina.
  return { entry, modal, pending }
}
