'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, X, ToggleLeft, ToggleRight } from 'lucide-react'
import { updateSequence, toggleSequenceActive, deleteSequence } from '../actions'

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

interface Props {
  sequenceId:     string
  sequenceName:   string
  language:       string
  description:    string
  active:         boolean
  activeRunCount: number
  agentId:        string | null
  agents:         Array<{ id: string; name: string }>
}

export function SequenceDetailActions({ sequenceId, sequenceName, language, description, active, activeRunCount, agentId, agents }: Props) {
  const router  = useRouter()
  const [mode,    setMode]    = useState<'idle' | 'edit' | 'confirm_delete'>('idle')
  const [name,    setName]    = useState(sequenceName)
  const [lang,    setLang]    = useState(language)
  const [desc,    setDesc]    = useState(description)
  const [agId,    setAgId]    = useState(agentId ?? '') // '' = Toda la agencia
  const [error,   setError]   = useState<string | null>(null)
  const [pending, start]      = useTransition()

  function handleSave() {
    setError(null)
    start(async () => {
      const res = await updateSequence(sequenceId, { name, language: lang, description: desc, agentId: agId || null })
      if (!res.ok) { setError(res.error); return }
      setMode('idle')
      router.refresh()
    })
  }

  function handleToggle() {
    start(async () => {
      await toggleSequenceActive(sequenceId, !active)
      router.refresh()
    })
  }

  function handleDelete() {
    setError(null)
    start(async () => {
      const res = await deleteSequence(sequenceId)
      if (!res.ok) { setError(res.error); return }
      router.push('/emails')
    })
  }

  return (
    <>
      <style>{`
        .sda-input:focus { border-color: var(--border-accent) !important; }
      `}</style>

      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={() => { setName(sequenceName); setLang(language); setDesc(description); setAgId(agentId ?? ''); setMode('edit') }}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', fontSize: '12px', fontWeight: 500,
            color: 'var(--text-secondary)', background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
          }}
        >
          <Pencil size={12} /> Editar
        </button>

        <button
          onClick={handleToggle}
          disabled={pending}
          title={active ? 'Desactivar' : 'Activar'}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', fontSize: '12px', fontWeight: 500,
            color: active ? 'var(--accent-green)' : 'var(--text-muted)',
            background: active ? 'rgba(107,163,104,0.08)' : 'var(--bg-elevated)',
            border: active ? '1px solid rgba(107,163,104,0.25)' : '1px solid var(--border-subtle)',
            borderRadius: '8px', cursor: pending ? 'not-allowed' : 'pointer',
            opacity: pending ? 0.7 : 1,
          }}
        >
          {active ? <ToggleRight size={13} /> : <ToggleLeft size={13} />}
          {active ? 'Activa' : 'Inactiva'}
        </button>

        <button
          onClick={() => setMode('confirm_delete')}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', fontSize: '12px', fontWeight: 500,
            color: 'var(--accent-coral)', background: 'rgba(201,123,107,0.08)',
            border: '1px solid rgba(201,123,107,0.25)', borderRadius: '8px', cursor: 'pointer',
          }}
        >
          <Trash2 size={12} /> Eliminar
        </button>
      </div>

      {/* Edit modal */}
      {mode === 'edit' && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 50 }} onClick={() => setMode('idle')} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
            borderRadius: '16px', padding: '24px', width: '480px', maxWidth: '90vw', zIndex: 51,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Editar secuencia</span>
              <button onClick={() => setMode('idle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
              <div>
                <label style={LABEL}>Nombre</label>
                <input value={name} onChange={e => setName(e.target.value)} maxLength={100} className="sda-input" style={INPUT} autoFocus />
              </div>
              <div>
                <label style={LABEL}>Idioma</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {([{ v: 'es', label: 'Español' }, { v: 'en', label: 'English' }, { v: 'pt', label: 'Português' }] as const).map(opt => (
                    <button key={opt.v} type="button" onClick={() => setLang(opt.v)} style={{
                      padding: '6px 14px', fontSize: '12px', fontWeight: 500, borderRadius: '8px', cursor: 'pointer',
                      background: lang === opt.v ? 'rgba(201,169,110,0.15)' : 'var(--bg-elevated)',
                      color: lang === opt.v ? 'var(--accent-gold)' : 'var(--text-muted)',
                      border: lang === opt.v ? '1px solid rgba(201,169,110,0.3)' : '1px solid var(--border-subtle)',
                    }}>{opt.label}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={LABEL}>Agente (organizacional)</label>
                <select value={agId} onChange={e => setAgId(e.target.value)} className="sda-input" style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}>
                  <option value="">Toda la agencia</option>
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>No afecta el envío de emails.</div>
              </div>
              <div>
                <label style={LABEL}>Descripción</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} maxLength={500} rows={3} className="sda-input" style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }} />
              </div>
            </div>

            {error && <div style={{ fontSize: '12px', color: '#E04040', marginBottom: '12px', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setMode('idle')} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleSave} disabled={!name.trim() || pending} style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none',
                cursor: (!name.trim() || pending) ? 'not-allowed' : 'pointer', opacity: (!name.trim() || pending) ? 0.7 : 1,
              }}>{pending ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </>
      )}

      {/* Delete confirmation */}
      {mode === 'confirm_delete' && (
        <>
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 50 }} onClick={() => setMode('idle')} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--bg-surface)', border: '1px solid var(--border-accent)',
            borderRadius: '16px', padding: '24px', width: '420px', maxWidth: '90vw', zIndex: 51,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Eliminar secuencia</span>
              <button onClick={() => setMode('idle')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: activeRunCount > 0 ? '10px' : '20px' }}>
              ¿Eliminar <strong style={{ color: 'var(--text-primary)' }}>{sequenceName}</strong>? Se eliminarán también todos sus pasos.
            </p>
            {activeRunCount > 0 && (
              <div style={{ background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.2)', borderRadius: '8px', padding: '10px 12px', marginBottom: '20px', fontSize: '12px', color: 'var(--accent-coral)', lineHeight: 1.5 }}>
                Esta secuencia tiene <strong>{activeRunCount}</strong> run{activeRunCount !== 1 ? 's' : ''} activo{activeRunCount !== 1 ? 's' : ''}.
                Si la eliminas, esos leads dejarán de recibir emails de esta secuencia.
              </div>
            )}
            {error && <div style={{ fontSize: '12px', color: '#E04040', marginBottom: '12px', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setMode('idle')} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleDelete} disabled={pending} style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                background: 'rgba(201,123,107,0.15)', color: 'var(--accent-coral)',
                border: '1px solid rgba(201,123,107,0.3)',
                cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.7 : 1,
              }}>{pending ? 'Eliminando...' : 'Eliminar'}</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
