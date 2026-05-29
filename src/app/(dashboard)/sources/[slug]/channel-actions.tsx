'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { updateChannel, updateChannelSequence, archiveChannel } from '../actions'

interface ChannelActionsProps {
  channelId:       string
  channelName:     string
  channelActive:   boolean
  emailSequenceId: string | null
  sequences:       Array<{ id: string; name: string }>
}

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '8px 12px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}

const LABEL: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '6px',
  display: 'block',
}

export function ChannelActions({ channelId, channelName, channelActive, emailSequenceId, sequences }: ChannelActionsProps) {
  const router = useRouter()
  const [mode,       setMode]       = useState<'idle' | 'edit' | 'confirm_archive'>('idle')
  const [name,       setName]       = useState(channelName)
  const [active,     setActive]     = useState(channelActive)
  const [sequenceId, setSequenceId] = useState<string>(emailSequenceId ?? '')
  const [error,      setError]      = useState<string | null>(null)
  const [pending,    start]         = useTransition()

  function handleSave() {
    setError(null)
    start(async () => {
      const [nameRes, seqRes] = await Promise.all([
        updateChannel(channelId, { name, active }),
        updateChannelSequence(channelId, sequenceId || null),
      ])
      if (!nameRes.ok) { setError(nameRes.error); return }
      if (!seqRes.ok)  { setError(seqRes.error);  return }
      setMode('idle')
      router.refresh()
    })
  }

  function handleArchive() {
    start(async () => {
      const res = await archiveChannel(channelId)
      if (!res.ok) { setError(res.error); return }
      router.push('/sources')
    })
  }

  return (
    <>
      <style>{`
        .ch-act-input:focus { border-color: var(--border-accent) !important; outline: none; }
      `}</style>

      {/* Action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => { setName(channelName); setActive(channelActive); setSequenceId(emailSequenceId ?? ''); setMode('edit') }}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', fontSize: '12px', fontWeight: 500,
            color: 'var(--text-secondary)',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px', cursor: 'pointer',
          }}
        >
          <Pencil size={12} /> Editar
        </button>
        <button
          onClick={() => setMode('confirm_archive')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', fontSize: '12px', fontWeight: 500,
            color: 'var(--accent-coral)',
            background: 'rgba(201,123,107,0.08)',
            border: '1px solid rgba(201,123,107,0.25)',
            borderRadius: '8px', cursor: 'pointer',
          }}
        >
          <Trash2 size={12} /> Archivar
        </button>
      </div>

      {/* Edit modal */}
      {mode === 'edit' && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 50 }}
            onClick={() => setMode('idle')} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
            borderRadius: '16px', padding: '24px', width: '440px', maxWidth: '90vw', zIndex: 51,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Editar fuente</span>
              <button onClick={() => setMode('idle')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={LABEL}>Nombre</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="ch-act-input"
                  style={INPUT}
                  autoFocus
                />
              </div>

              <div>
                <label style={{ ...LABEL, marginBottom: '10px' }}>Estado</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[{ v: true, label: 'Activo' }, { v: false, label: 'Inactivo' }].map(opt => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setActive(opt.v)}
                      style={{
                        padding: '6px 16px', fontSize: '12px', fontWeight: 500, borderRadius: '6px',
                        cursor: 'pointer', transition: 'all 0.15s',
                        background: active === opt.v
                          ? (opt.v ? 'rgba(107,163,104,0.15)' : 'rgba(201,123,107,0.12)')
                          : 'var(--bg-elevated)',
                        color: active === opt.v
                          ? (opt.v ? 'var(--accent-green)' : 'var(--accent-coral)')
                          : 'var(--text-muted)',
                        border: active === opt.v
                          ? (opt.v ? '1px solid rgba(107,163,104,0.3)' : '1px solid rgba(201,123,107,0.3)')
                          : '1px solid var(--border-subtle)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={LABEL}>Secuencia de Email</label>
                <select
                  value={sequenceId}
                  onChange={e => setSequenceId(e.target.value)}
                  className="ch-act-input"
                  style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}
                >
                  <option value="">Ninguna</option>
                  {sequences.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                {sequences.length === 0 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px' }}>
                    No hay secuencias disponibles. Crea una en{' '}
                    <Link href="/emails/new" style={{ color: 'var(--accent-gold)', textDecoration: 'none' }}>Secuencias de Email →</Link>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <div style={{ fontSize: '12px', color: '#E04040', marginBottom: '12px', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setMode('idle')}
                style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={!name.trim() || pending}
                style={{
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: 'var(--accent-gold)', color: 'var(--bg-base)',
                  border: 'none', cursor: (!name.trim() || pending) ? 'not-allowed' : 'pointer',
                  opacity: (!name.trim() || pending) ? 0.7 : 1,
                }}
              >
                {pending ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Archive confirmation */}
      {mode === 'confirm_archive' && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 50 }}
            onClick={() => setMode('idle')} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
            borderRadius: '16px', padding: '24px', width: '400px', maxWidth: '90vw', zIndex: 51,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Archivar fuente</span>
              <button onClick={() => setMode('idle')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px', lineHeight: 1.5 }}>
              ¿Archivar <strong style={{ color: 'var(--text-primary)' }}>{channelName}</strong>? La fuente quedará inactiva y no aparecerá en el listado. Los leads atribuidos se conservan.
            </p>

            {error && (
              <div style={{ fontSize: '12px', color: '#E04040', marginBottom: '12px', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setMode('idle')}
                style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                Cancelar
              </button>
              <button
                onClick={handleArchive}
                disabled={pending}
                style={{
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: 'rgba(201,123,107,0.12)', color: 'var(--accent-coral)',
                  border: '1px solid rgba(201,123,107,0.3)',
                  cursor: pending ? 'not-allowed' : 'pointer',
                  opacity: pending ? 0.7 : 1,
                }}
              >
                {pending ? 'Archivando...' : 'Confirmar archivo'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
