'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Trash2, X, ToggleLeft, ToggleRight } from 'lucide-react'
import Link from 'next/link'
import { toggleSequenceActive, deleteSequence } from './actions'

interface Props {
  sequenceId:     string
  sequenceName:   string
  active:         boolean
  activeRunCount: number
}

export function SequenceListActions({ sequenceId, sequenceName, active, activeRunCount }: Props) {
  const router  = useRouter()
  const [mode,    setMode]    = useState<'idle' | 'confirm_delete'>('idle')
  const [error,   setError]   = useState<string | null>(null)
  const [pending, start]      = useTransition()

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
      setMode('idle')
      router.refresh()
    })
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <Link
          href={`/emails/${sequenceId}`}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', borderRadius: '6px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)', textDecoration: 'none',
          }}
          title="Ver detalle"
        >
          <Eye size={13} />
        </Link>

        <button
          onClick={handleToggle}
          disabled={pending}
          title={active ? 'Desactivar' : 'Activar'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', borderRadius: '6px',
            background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
            color: active ? 'var(--accent-green)' : 'var(--text-muted)',
            cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          {active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
        </button>

        <button
          onClick={() => setMode('confirm_delete')}
          title="Eliminar"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '28px', height: '28px', borderRadius: '6px',
            background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.2)',
            color: 'var(--accent-coral)', cursor: 'pointer',
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Delete confirmation modal */}
      {mode === 'confirm_delete' && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 50 }}
            onClick={() => setMode('idle')}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
            borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '90vw', zIndex: 51,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Eliminar secuencia</span>
              <button onClick={() => setMode('idle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: activeRunCount > 0 ? '10px' : '20px' }}>
              ¿Eliminar <strong style={{ color: 'var(--text-primary)' }}>{sequenceName}</strong>?
              Esta acción eliminará la secuencia y todos sus pasos.
            </p>

            {activeRunCount > 0 && (
              <div style={{
                background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.2)',
                borderRadius: '8px', padding: '10px 12px', marginBottom: '20px',
                fontSize: '12px', color: 'var(--accent-coral)', lineHeight: 1.5,
              }}>
                Esta secuencia tiene <strong>{activeRunCount}</strong> run{activeRunCount !== 1 ? 's' : ''} activo{activeRunCount !== 1 ? 's' : ''}.
                Si la eliminas, esos runs se cancelarán y los leads dejarán de recibir emails de esta secuencia.
              </div>
            )}

            {error && (
              <div style={{ fontSize: '12px', color: '#E04040', marginBottom: '12px', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button
                onClick={() => setMode('idle')}
                style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={pending}
                style={{
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: 'rgba(201,123,107,0.15)', color: 'var(--accent-coral)',
                  border: '1px solid rgba(201,123,107,0.3)',
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending ? 0.7 : 1,
                }}
              >
                {pending ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
