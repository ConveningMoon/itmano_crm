'use client'

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Folder as FolderIcon, FolderPlus, MoreVertical, Pencil, Trash2, X } from 'lucide-react'
import type { Folder, FolderKind } from '@/lib/data/folders'
import { createFolder, renameFolder, deleteFolder, moveToFolder } from '@/app/(dashboard)/folder-actions'

// ─── Carpetas: la UI compartida entre /sources y /emails ──────────────────────
//
// Las dos secciones agrupan cosas distintas pero con exactamente los mismos
// gestos: crear una carpeta, plegarla, renombrarla, borrarla y mover un
// elemento. Vive aquí para que no haya dos copias que se separen con el tiempo.
//
// El estado plegado/desplegado es de cada navegador (localStorage): es una
// preferencia de vista, no un dato del negocio, y guardarlo en la base sería
// un viaje al servidor por cada click en una flecha.

const BTN_GHOST: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: '12px',
  color: 'var(--text-muted)',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
}

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '13px',
  color: 'var(--text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
}

const BTN_PRIMARY: React.CSSProperties = {
  padding: '9px 18px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--bg-base)',
  background: 'var(--accent-gold)',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
}

const ERROR_BOX: React.CSSProperties = {
  fontSize: '12px',
  color: 'var(--accent-coral)',
  padding: '6px 10px',
  background: 'rgba(201,123,107,0.10)',
  borderRadius: '6px',
}

// ─── Modal de nombre (crear y renombrar) ──────────────────────────────────────

function NameModal({ title, initial, confirmLabel, onConfirm, onClose }: {
  title:        string
  initial:      string
  confirmLabel: string
  onConfirm:    (name: string) => Promise<{ ok: true } | { ok: false; error: string }>
  onClose:      () => void
}) {
  const [name,    setName]    = useState(initial)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, start]      = useTransition()

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
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: '16px', width: '100%', maxWidth: '420px',
        }}
      >
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input
            value={name}
            autoFocus
            maxLength={60}
            onChange={e => setName(e.target.value)}
            style={INPUT}
            placeholder="Ej. Campañas 2026"
          />
          {error && <div style={ERROR_BOX}>{error}</div>}
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ ...BTN_GHOST, fontSize: '13px' }}>Cancelar</button>
            <button type="submit" disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
              {pending ? 'Guardando…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Botón "Nueva carpeta" ────────────────────────────────────────────────────

export function NewFolderButton({ kind }: { kind: FolderKind }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} style={BTN_GHOST}>
        <FolderPlus size={13} />
        Nueva carpeta
      </button>
      {open && (
        <NameModal
          title="Nueva carpeta"
          initial=""
          confirmLabel="Crear"
          onConfirm={name => createFolder(kind, name)}
          onClose={() => { setOpen(false); router.refresh() }}
        />
      )}
    </>
  )
}

// ─── Cabecera plegable de una carpeta ─────────────────────────────────────────

// localStorage es un sistema externo a React, así que se lee con
// `useSyncExternalStore` y no con un efecto que haga setState: el snapshot del
// servidor es siempre "desplegada", el del cliente sale del storage, y React se
// encarga de que la hidratación no choque.
const collapseListeners = new Set<() => void>()

function notifyCollapse() {
  for (const listener of collapseListeners) listener()
}

function subscribeCollapse(listener: () => void) {
  collapseListeners.add(listener)
  // Otra pestaña del mismo usuario también pliega carpetas: `storage` avisa.
  window.addEventListener('storage', listener)
  return () => {
    collapseListeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function useCollapsed(folderId: string): [boolean, (v: boolean) => void] {
  const storageKey = `folder-collapsed:${folderId}`

  const collapsed = useSyncExternalStore(
    subscribeCollapse,
    () => {
      try {
        return window.localStorage.getItem(storageKey) === '1'
      } catch { return false } // modo privado o storage bloqueado: desplegada
    },
    () => false,
  )

  // El HTML del servidor no puede saber qué plegó este navegador, así que la
  // carpeta se hidrata desplegada y el snapshot del cliente no coincide con el
  // del servidor. Este aviso al montar hace que React vuelva a leer el storage
  // y aplique la preferencia. Va en un macrotask y no en el cuerpo del efecto
  // para no competir con la hidratación; `requestAnimationFrame` no sirve aquí
  // porque no corre en una pestaña en segundo plano.
  useEffect(() => {
    const id = setTimeout(notifyCollapse, 0)
    return () => clearTimeout(id)
  }, [])

  function update(value: boolean) {
    try {
      window.localStorage.setItem(storageKey, value ? '1' : '0')
    } catch { /* la preferencia no se recuerda, pero la vista debe reaccionar */ }
    notifyCollapse()
  }

  return [collapsed, update]
}

export function FolderGroup({ folder, count, children }: {
  folder:   Folder
  count:    number
  children: React.ReactNode
}) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useCollapsed(folder.id)
  const [menu,      setMenu]      = useState(false)
  const [modal,     setModal]     = useState<'rename' | 'delete' | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [pending,   start]        = useTransition()

  function handleDelete() {
    setError(null)
    start(async () => {
      const res = await deleteFolder(folder.id)
      if (!res.ok) { setError(res.error); return }
      setModal(null)
      router.refresh()
    })
  }

  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        padding: '8px 12px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        borderRadius: collapsed ? '10px' : '10px 10px 0 0',
        borderBottom: collapsed ? '1px solid var(--border-subtle)' : 'none',
      }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', flex: 1,
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--text-primary)', textAlign: 'left',
          }}
        >
          <ChevronRight
            size={14}
            style={{
              color: 'var(--text-muted)', flexShrink: 0,
              transform: collapsed ? 'none' : 'rotate(90deg)',
              transition: 'transform 0.15s',
            }}
          />
          <FolderIcon size={14} style={{ color: 'var(--accent-gold)', flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{folder.name}</span>
          <span style={{
            fontSize: '11px', color: 'var(--text-muted)',
            background: 'var(--bg-overlay)', padding: '1px 8px', borderRadius: '10px',
          }}>
            {count}
          </span>
        </button>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setMenu(v => !v)}
            aria-label={`Opciones de ${folder.name}`}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '26px', height: '26px', borderRadius: '6px',
              background: 'transparent', border: '1px solid var(--border-subtle)',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <MoreVertical size={13} />
          </button>
          {menu && (
            <>
              <div onClick={() => setMenu(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{
                position: 'absolute', right: 0, top: '30px', zIndex: 41,
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: '8px', boxShadow: 'var(--shadow-md)', minWidth: '170px', overflow: 'hidden',
              }}>
                <button
                  onClick={() => { setMenu(false); setModal('rename') }}
                  style={MENU_ITEM}
                >
                  <Pencil size={12} /> Renombrar
                </button>
                <button
                  onClick={() => { setMenu(false); setModal('delete') }}
                  style={{ ...MENU_ITEM, color: 'var(--accent-coral)' }}
                >
                  <Trash2 size={12} /> Eliminar carpeta
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {!collapsed && (
        <div style={{
          border: '1px solid var(--border-subtle)', borderTop: 'none',
          borderRadius: '0 0 10px 10px', overflow: 'hidden',
        }}>
          {count === 0
            ? <div style={{ padding: '18px', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Carpeta vacía · usa el icono de carpeta de cada fila para mover algo aquí.
              </div>
            : children}
        </div>
      )}

      {modal === 'rename' && (
        <NameModal
          title="Renombrar carpeta"
          initial={folder.name}
          confirmLabel="Guardar"
          onConfirm={name => renameFolder(folder.id, name)}
          onClose={() => { setModal(null); router.refresh() }}
        />
      )}

      {modal === 'delete' && (
        <div
          onClick={() => setModal(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: '16px', width: '100%', maxWidth: '420px', padding: '20px',
              display: 'flex', flexDirection: 'column', gap: '14px',
            }}
          >
            <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
              Eliminar “{folder.name}”
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Se elimina sólo la carpeta. Lo que hay dentro no se borra: vuelve a la lista sin carpeta.
            </span>
            {error && <div style={ERROR_BOX}>{error}</div>}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(null)} style={{ ...BTN_GHOST, fontSize: '13px' }}>Cancelar</button>
              <button
                onClick={handleDelete}
                disabled={pending}
                style={{
                  ...BTN_PRIMARY, background: 'var(--accent-coral)', color: 'var(--bg-base)',
                  opacity: pending ? 0.6 : 1,
                }}
              >
                {pending ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const MENU_ITEM: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
  padding: '9px 12px', fontSize: '12px', textAlign: 'left',
  background: 'transparent', border: 'none', cursor: 'pointer',
  color: 'var(--text-secondary)',
}

// ─── Mover un elemento a una carpeta ──────────────────────────────────────────

export function FolderPicker({ kind, itemId, folders, currentFolderId, label }: {
  kind:            FolderKind
  itemId:          string
  folders:         Folder[]
  currentFolderId: string | null
  /** Nombre del elemento, sólo para lectores de pantalla. */
  label:           string
}) {
  const router = useRouter()
  // El desplegable se posiciona con `fixed` y coordenadas calculadas al abrir:
  // las filas viven en un contenedor con `overflow: hidden` (el que redondea las
  // esquinas de la tabla), y en `absolute` el menú se cortaba por abajo en la
  // última fila. `fixed` lo saca de ese recorte.
  const [anchor,  setAnchor]  = useState<{ top: number; right: number } | null>(null)
  const [creating, setCreating] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, start]      = useTransition()
  const boxRef = useRef<HTMLDivElement>(null)
  const open = anchor !== null

  function toggle() {
    if (open) { setAnchor(null); return }
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return
    setAnchor({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }

  function setOpen(value: boolean) {
    if (value) toggle()
    else setAnchor(null)
  }

  function move(folderId: string | null) {
    setError(null)
    start(async () => {
      const res = await moveToFolder(kind, itemId, folderId)
      if (!res.ok) { setError(res.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={e => { e.stopPropagation(); toggle() }}
        title={currentFolderId ? 'Cambiar de carpeta' : 'Mover a una carpeta'}
        aria-label={`Mover ${label} a una carpeta`}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '28px', height: '28px', borderRadius: '6px',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
          color: currentFolderId ? 'var(--accent-gold)' : 'var(--text-secondary)',
          cursor: pending ? 'wait' : 'pointer',
        }}
      >
        <FolderIcon size={13} />
      </button>

      {open && (
        <>
          <div
            onClick={e => { e.stopPropagation(); setOpen(false) }}
            style={{ position: 'fixed', inset: 0, zIndex: 40 }}
          />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: anchor.top, right: anchor.right, zIndex: 41,
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: '8px', boxShadow: 'var(--shadow-md)',
              minWidth: '210px', maxHeight: '280px', overflowY: 'auto',
            }}
          >
            <div style={{
              padding: '8px 12px', fontSize: '10px', textTransform: 'uppercase',
              letterSpacing: '0.06em', color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border-subtle)',
            }}>
              Mover a
            </div>

            <button
              onClick={() => move(null)}
              disabled={pending || currentFolderId === null}
              style={{
                ...MENU_ITEM,
                color: currentFolderId === null ? 'var(--text-muted)' : 'var(--text-secondary)',
                cursor: currentFolderId === null ? 'default' : 'pointer',
              }}
            >
              Sin carpeta
            </button>

            {folders.map(f => (
              <button
                key={f.id}
                onClick={() => move(f.id)}
                disabled={pending || f.id === currentFolderId}
                style={{
                  ...MENU_ITEM,
                  color: f.id === currentFolderId ? 'var(--accent-gold)' : 'var(--text-secondary)',
                  cursor: f.id === currentFolderId ? 'default' : 'pointer',
                }}
              >
                <FolderIcon size={12} style={{ flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              </button>
            ))}

            <button
              onClick={() => setCreating(true)}
              style={{ ...MENU_ITEM, borderTop: '1px solid var(--border-subtle)', color: 'var(--accent-gold)' }}
            >
              <FolderPlus size={12} /> Nueva carpeta…
            </button>

            {error && <div style={{ ...ERROR_BOX, margin: '8px' }}>{error}</div>}
          </div>
        </>
      )}

      {creating && (
        <NameModal
          title="Nueva carpeta"
          initial=""
          confirmLabel="Crear y mover"
          // Crear y mover en un gesto: quien abre este menú ya sabe dónde quiere
          // el elemento, y obligarle a crear la carpeta arriba y volver aquí
          // convertía una acción en tres.
          onConfirm={async name => {
            const created = await createFolder(kind, name)
            if (!created.ok) return created
            return moveToFolder(kind, itemId, created.data.id)
          }}
          onClose={() => { setCreating(false); setOpen(false); router.refresh() }}
        />
      )}
    </div>
  )
}
