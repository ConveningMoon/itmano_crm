'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Power, PowerOff, Trash2 } from 'lucide-react'
import type { Folder } from '@/lib/data/folders'
import { useFolderMenu } from '@/components/dashboard/folders'
import { ModalShell } from '@/components/motion/modal-shell'
import { RowMenu } from '@/components/ui/row-menu'
import { toggleSequenceActive, deleteSequence } from './actions'

interface Props {
  sequenceId:      string
  sequenceName:    string
  active:          boolean
  activeRunCount:  number
  folders:         Folder[]
  currentFolderId: string | null
}

// Todo lo que se puede hacer con una secuencia desde la lista, en un menú ⋯. La
// acción principal (abrir el detalle) es el clic en el nombre; aquí quedan las
// demás, con el borrado separado y confirmado en un modal.
export function SequenceListActions({ sequenceId, sequenceName, active, activeRunCount, folders, currentFolderId }: Props) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,   setError]   = useState<string | null>(null)
  const [pending, start]      = useTransition()
  const folderMenu = useFolderMenu('sequence', sequenceId, folders, currentFolderId)
  const busy = pending || folderMenu.pending

  function handleToggle() {
    setError(null)
    start(async () => {
      const res = await toggleSequenceActive(sequenceId, !active)
      if (!res.ok) setError(res.error)
      else router.refresh()
    })
  }

  function handleDelete() {
    setError(null)
    start(async () => {
      const res = await deleteSequence(sequenceId)
      if (!res.ok) { setError(res.error); return }
      setConfirmDelete(false)
      router.refresh()
    })
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
      {busy && <span className="loading-spinner" role="status" aria-label="Guardando" />}
      <RowMenu
        label={sequenceName}
        entries={[
          { type: 'item', label: 'Ver detalle', icon: <Eye size={14} />, href: `/emails/${sequenceId}` },
          { type: 'item', label: active ? 'Desactivar' : 'Activar', icon: active ? <PowerOff size={14} /> : <Power size={14} />, onSelect: handleToggle },
          folderMenu.entry,
          { type: 'separator' },
          { type: 'item', label: 'Eliminar', icon: <Trash2 size={14} />, tone: 'danger', onSelect: () => { setError(null); setConfirmDelete(true) } },
        ]}
      />

      {folderMenu.modal}

      <ModalShell open={confirmDelete} onClose={() => setConfirmDelete(false)} maxWidth={440}>
        <div style={{ padding: '22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)' }}>Eliminar secuencia</div>

          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            ¿Eliminar <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{sequenceName}</strong>?
            Se eliminan la secuencia y todos sus pasos.
          </p>

          {activeRunCount > 0 && (
            <div style={{
              background: 'color-mix(in srgb, var(--accent-coral) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent-coral) 25%, transparent)',
              borderRadius: '8px', padding: '10px 12px',
              fontSize: '12px', color: 'var(--accent-coral)', lineHeight: 1.5,
            }}>
              Tiene <strong style={{ fontWeight: 500 }}>{activeRunCount}</strong> run{activeRunCount !== 1 ? 's' : ''} activo{activeRunCount !== 1 ? 's' : ''}.
              Si la eliminas, se cancelan y esos leads dejan de recibir emails de esta secuencia.
            </div>
          )}

          {error && (
            <div role="alert" style={{ fontSize: '12px', color: 'var(--accent-coral)', padding: '8px 10px', background: 'color-mix(in srgb, var(--accent-coral) 10%, transparent)', borderRadius: '8px' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={() => setConfirmDelete(false)} className="btn btn-ghost">Cancelar</button>
            <button onClick={handleDelete} disabled={pending} className="btn btn-danger">
              {pending && <span className="loading-spinner" aria-hidden="true" />}
              {pending ? 'Eliminando…' : 'Eliminar'}
            </button>
          </div>
        </div>
      </ModalShell>

      {/* Un error del interruptor (no del borrado) no tiene modal donde caer. */}
      {error && !confirmDelete && (
        <span role="alert" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{error}</span>
      )}
    </div>
  )
}
