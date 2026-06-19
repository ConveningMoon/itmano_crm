'use client'

import { useState, useMemo, useTransition } from 'react'
import { Search, X, UserPlus } from 'lucide-react'
import { addLeadsToSequence } from '../actions'

export interface PickerLead {
  id:        string
  firstName: string
  lastName:  string
  email:     string
}

interface Props {
  sequenceId: string
  leads:      PickerLead[]
}

export function ManualLeadPicker({ sequenceId, leads }: Props) {
  const [search,   setSearch]   = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [toast,    setToast]    = useState<string | null>(null)
  const [pending,  start]       = useTransition()

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return leads.filter(l =>
      q === '' ||
      `${l.firstName} ${l.lastName}`.toLowerCase().includes(q) ||
      l.email.toLowerCase().includes(q)
    )
  }, [leads, search])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleAll() {
    const visibleIds = filtered.map(l => l.id)
    const allSelected = visibleIds.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  function handleEnroll() {
    const ids = [...selected]
    start(async () => {
      const res = await addLeadsToSequence(ids, sequenceId)
      if (!res.ok) {
        setToast(`Error: ${res.error}`)
        return
      }
      const { enrolled, skipped, blocked, errors } = res.result
      const parts: string[] = []
      if (enrolled > 0) parts.push(`${enrolled} ${enrolled === 1 ? 'lead agregado' : 'leads agregados'}`)
      if (skipped  > 0) parts.push(`${skipped} omitido${skipped > 1 ? 's' : ''} (ya activos)`)
      if (blocked  > 0) parts.push(`${blocked} omitido${blocked > 1 ? 's' : ''} (email bloqueado)`)
      if (errors.length > 0) parts.push(`${errors.length} error${errors.length > 1 ? 'es' : ''}`)
      setToast(parts.join(' · '))
      setSelected(new Set())
    })
  }

  const visibleIds  = filtered.map(l => l.id)
  const allChecked  = visibleIds.length > 0 && visibleIds.every(id => selected.has(id))
  const someChecked = visibleIds.some(id => selected.has(id)) && !allChecked

  return (
    <div>
      <style>{`
        .picker-row:hover { background: var(--bg-elevated) !important; }
        .picker-input:focus { border-color: var(--border-accent) !important; outline: none; }
      `}</style>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: '12px' }}>
        <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o email..."
          className="picker-input"
          style={{
            width: '100%', background: 'var(--bg-overlay)',
            border: '1px solid var(--border-subtle)', borderRadius: '8px',
            padding: '7px 12px 7px 32px', color: 'var(--text-primary)',
            fontSize: '13px', boxSizing: 'border-box',
          }}
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Lead list */}
      <div style={{
        background: 'var(--bg-overlay)', border: '1px solid var(--border-subtle)',
        borderRadius: '8px', overflow: 'hidden', maxHeight: '320px', overflowY: 'auto',
      }}>
        {/* Header row with select-all */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-elevated)',
        }}>
          <input
            type="checkbox"
            checked={allChecked}
            ref={el => { if (el) el.indeterminate = someChecked }}
            onChange={toggleAll}
            style={{ cursor: 'pointer', accentColor: 'var(--accent-gold)' }}
          />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 }}>
            {filtered.length} leads disponibles
          </span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
            No se encontraron leads
          </div>
        ) : (
          filtered.map(lead => (
            <label
              key={lead.id}
              className="picker-row"
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px', cursor: 'pointer',
                background: selected.has(lead.id) ? 'rgba(201,169,110,0.06)' : 'transparent',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(lead.id)}
                onChange={() => toggle(lead.id)}
                style={{ cursor: 'pointer', flexShrink: 0, accentColor: 'var(--accent-gold)' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                  {lead.firstName} {lead.lastName}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lead.email}
                </div>
              </div>
            </label>
          ))
        )}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {selected.size > 0 ? `${selected.size} seleccionado${selected.size > 1 ? 's' : ''}` : 'Ninguno seleccionado'}
        </span>
        <button
          onClick={handleEnroll}
          disabled={selected.size === 0 || pending}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 18px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
            background: selected.size === 0 || pending ? 'var(--bg-elevated)' : 'var(--accent-gold)',
            color: selected.size === 0 || pending ? 'var(--text-muted)' : 'var(--bg-base)',
            border: 'none', cursor: selected.size === 0 || pending ? 'not-allowed' : 'pointer',
          }}
        >
          <UserPlus size={14} />
          {pending ? 'Agregando...' : `Agregar ${selected.size > 0 ? selected.size : ''} lead${selected.size !== 1 ? 's' : ''} a la secuencia`}
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          marginTop: '10px', padding: '8px 12px', borderRadius: '6px', fontSize: '12px',
          background: toast.startsWith('Error') ? 'rgba(224,64,64,0.08)' : 'rgba(107,163,104,0.10)',
          color: toast.startsWith('Error') ? '#E04040' : 'var(--accent-green)',
          border: `1px solid ${toast.startsWith('Error') ? 'rgba(224,64,64,0.2)' : 'rgba(107,163,104,0.2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        }}>
          <span>{toast}</span>
          <button onClick={() => setToast(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', display: 'flex' }}>
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  )
}
