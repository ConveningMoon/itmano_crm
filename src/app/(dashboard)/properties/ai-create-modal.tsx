'use client'

import { useRef, useState } from 'react'
import { Sparkles, Upload, X, FileText } from 'lucide-react'
import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'

// Popup de "Crear con IA": sube el PDF del listado y elige los idiomas del
// contenido a generar (máx 3) — todo en un mismo paso. Al generar, el padre
// corre la extracción y abre el formulario prellenado.

const MAX_LANGS = 3

export function AiCreateModal({
  onClose,
  onGenerate,
}: {
  onClose: () => void
  // Corre la extracción; devuelve error si falla (el modal lo muestra y no cierra).
  onGenerate: (file: File, langs: string[]) => Promise<{ ok: boolean; error?: string }>
}) {
  const [file, setFile]   = useState<File | null>(null)
  const [langs, setLangs] = useState<string[]>(['es', 'en'])
  const [busy, setBusy]   = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (f.type !== 'application/pdf') { setError('Sube un archivo PDF.'); return }
    if (f.size > 10 * 1024 * 1024) { setError('El PDF supera 10 MB.'); return }
    setError(null)
    setFile(f)
  }

  function toggleLang(l: string) {
    setLangs(prev => prev.includes(l)
      ? prev.filter(x => x !== l)
      : (prev.length >= MAX_LANGS ? prev : [...prev, l]))
  }

  async function generate() {
    if (!file) { setError('Selecciona el PDF del listado.'); return }
    if (langs.length === 0) { setError('Elige al menos un idioma.'); return }
    setError(null)
    setBusy(true)
    const res = await onGenerate(file, langs)
    if (!res.ok) { setBusy(false); setError(res.error ?? 'No se pudo procesar el PDF.'); return }
    // El padre abre el formulario prellenado; cerramos este modal.
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 55,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
    >
      <div style={{
        background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
        borderRadius: '12px', padding: '28px', width: '100%', maxWidth: '480px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
            <Sparkles size={16} color="var(--accent-gold)" /> Crear con IA
          </h2>
          <button onClick={() => !busy && onClose()} style={{ background: 'none', border: 'none', cursor: busy ? 'default' : 'pointer', color: 'var(--text-muted)', padding: '4px', display: 'flex' }}>
            <X size={16} />
          </button>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0 0 20px' }}>
          Sube el PDF del listado y elige los idiomas. La IA prellena el formulario para que lo revises antes de guardar.
        </p>

        {/* Dropzone / archivo */}
        <div
          onClick={() => !busy && inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); if (!busy) pickFile(e.dataTransfer.files?.[0]) }}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
            padding: '24px', borderRadius: '10px', cursor: busy ? 'default' : 'pointer', textAlign: 'center',
            border: `1.5px dashed ${dragOver ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
            background: dragOver ? 'rgba(201,169,110,0.06)' : 'var(--bg-elevated)',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          {file ? (
            <>
              <FileText size={22} color="var(--accent-gold)" />
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, wordBreak: 'break-all' }}>{file.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Clic para reemplazar</span>
            </>
          ) : (
            <>
              <Upload size={22} color="var(--text-muted)" />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Arrastra el PDF o haz clic para elegirlo</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>PDF · máx 10 MB</span>
            </>
          )}
          <input ref={inputRef} type="file" accept="application/pdf" hidden onChange={e => { pickFile(e.target.files?.[0]); e.target.value = '' }} />
        </div>

        {/* Idiomas */}
        <div style={{ marginTop: '20px' }}>
          <label style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '8px' }}>
            Idiomas del contenido (máx {MAX_LANGS})
          </label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {SUPPORTED_LANGUAGE_CODES.map(l => {
              const on = langs.includes(l)
              const atMax = langs.length >= MAX_LANGS
              return (
                <button
                  key={l}
                  type="button"
                  disabled={!on && atMax}
                  onClick={() => toggleLang(l)}
                  style={{
                    padding: '5px 10px', fontSize: '12px', fontWeight: 500, borderRadius: '999px',
                    cursor: (!on && atMax) ? 'default' : 'pointer',
                    background: on ? 'rgba(201,169,110,0.15)' : 'transparent',
                    border: `1px solid ${on ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                    color: on ? 'var(--accent-gold)' : 'var(--text-muted)',
                    opacity: (!on && atMax) ? 0.4 : 1,
                  }}
                >
                  {LANGUAGE_CONFIG[l].flag} {LANGUAGE_CONFIG[l].label}
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <div style={{ fontSize: '12px', color: 'var(--accent-coral)', background: 'rgba(201,123,107,0.1)', borderRadius: '6px', padding: '8px 12px', marginTop: '16px' }}>
            {error}
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={() => !busy && onClose()}
            disabled={busy}
            style={{ padding: '8px 16px', fontSize: '13px', fontWeight: 500, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: busy ? 'default' : 'pointer' }}
          >
            Cancelar
          </button>
          <button
            onClick={generate}
            disabled={busy || !file}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 20px', fontSize: '13px', fontWeight: 500,
              background: 'var(--accent-gold)', color: 'var(--bg-base)',
              borderRadius: '8px', border: 'none',
              cursor: (busy || !file) ? 'default' : 'pointer', opacity: (busy || !file) ? 0.6 : 1,
            }}
          >
            <Sparkles size={13} /> {busy ? 'Procesando PDF…' : 'Generar'}
          </button>
        </div>
      </div>
    </div>
  )
}
