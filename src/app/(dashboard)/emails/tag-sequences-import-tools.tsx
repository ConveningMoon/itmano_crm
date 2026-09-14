'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Check, Clipboard, FileJson, Upload, X } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import {
  buildAllTagSequencesPrompt,
  MAX_ALL_TAG_EMAIL_IMPORT_BYTES,
} from '@/lib/email-sequence-import'
import { importAllTagSequenceSteps, type ImportAllTagSequencesResult } from './actions'
import type { TagSequenceCoverage } from '@/lib/data/tag-sequences'

const BUTTON: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px',
  fontSize: '12px', fontWeight: 500, background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', cursor: 'pointer',
}

export function TagSequencesImportTools({ coverage }: { coverage: TagSequenceCoverage[] }) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [modal, setModal] = useState<'prompt' | 'import' | null>(null)
  const [copied, setCopied] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawJson, setRawJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportAllTagSequencesResult | null>(null)
  const [pending, startTransition] = useTransition()

  const prompt = buildAllTagSequencesPrompt({
    tags: coverage.filter(item => item.tag.requiresSequence).map(item => ({
      slug: item.tag.slug,
      name: item.tag.name,
      description: item.tag.description,
      languages: item.slots.map(slot => slot.language),
    })),
  })

  function close() {
    setModal(null); setCopied(false); setError(null); setResult(null)
  }

  async function chooseFile(file?: File) {
    setError(null); setResult(null); setRawJson(''); setFileName(file?.name ?? null)
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) return setError('Selecciona un archivo con extensión .json.')
    if (file.size > MAX_ALL_TAG_EMAIL_IMPORT_BYTES) return setError('El archivo supera el límite de 5 MB.')
    try { setRawJson(await file.text()) } catch { setError('No se pudo leer el archivo.') }
  }

  function runImport() {
    if (!rawJson) return
    setError(null); setResult(null)
    startTransition(async () => {
      const response = await importAllTagSequenceSteps(rawJson)
      if (!response.ok) return setError(response.error)
      setResult(response.result)
      router.refresh()
    })
  }

  return <>
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button type="button" onClick={() => setModal('prompt')} style={BUTTON}><Bot size={13} />Prompt para IA</button>
      <button type="button" onClick={() => setModal('import')} style={{ ...BUTTON, color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.1)', borderColor: 'rgba(201,169,110,0.2)' }}><Upload size={13} />Importar JSON completo</button>
    </div>

    <ModalShell open={modal === 'prompt'} onClose={close} maxWidth={760}>
      <div style={{ padding: '24px' }}>
        <Header title="Prompt para todos los emails por etiqueta" onClose={close} />
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>El prompt incluye los slugs, idiomas y descripciones actuales. La IA debe devolver un único JSON para todo el catálogo.</p>
        <textarea readOnly value={prompt} rows={20} onFocus={event => event.currentTarget.select()} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-overlay)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.55 }} />
        {error && <p style={{ color: 'var(--accent-coral)', fontSize: '12px' }}>{error}</p>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(prompt); setCopied(true) } catch { setError('No se pudo copiar automáticamente.') } }} style={BUTTON}>
            {copied ? <Check size={13} /> : <Clipboard size={13} />}{copied ? 'Prompt copiado' : 'Copiar prompt'}
          </button>
        </div>
      </div>
    </ModalShell>

    <ModalShell open={modal === 'import'} onClose={close} maxWidth={680}>
      <div style={{ padding: '24px' }}>
        <Header title="Importar todos los emails por etiqueta" onClose={close} />
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55 }}>La operación es transaccional. Cada combinación etiqueta + idioma se ordena por separado; se conservan correos y horas ya ocupadas.</p>
        <input ref={inputRef} type="file" accept="application/json,.json" onChange={event => void chooseFile(event.target.files?.[0])} style={{ display: 'none' }} />
        <button type="button" onClick={() => inputRef.current?.click()} style={{ width: '100%', minHeight: '92px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '7px', borderRadius: '10px', border: '1px dashed var(--border-accent)', background: 'rgba(201,169,110,0.04)', color: 'var(--text-muted)', cursor: 'pointer' }}>
          <FileJson size={20} color="var(--accent-gold)" /><span>{fileName ?? 'Seleccionar archivo JSON'}</span><small>Máximo 5 MB</small>
        </button>
        {error && <p style={{ color: 'var(--accent-coral)', fontSize: '12px' }}>{error}</p>}
        {result && <div style={{ marginTop: '12px', padding: '11px', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
          <strong>{result.imported} emails importados en {result.sequences} secuencias.</strong>
          {result.skipped.length > 0 && <ul style={{ paddingLeft: '18px' }}>{result.skipped.map((item, index) => <li key={`${item.tagSlug}-${item.language}-${item.sendAtHours}-${index}`}>{item.tagSlug} ({item.language}), hora {item.sendAtHours}: {item.reason}</li>)}</ul>}
        </div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
          <button type="button" onClick={close} style={BUTTON}>{result ? 'Cerrar' : 'Cancelar'}</button>
          {!result && <button type="button" onClick={runImport} disabled={pending || !rawJson} style={{ ...BUTTON, background: 'var(--accent-gold)', color: 'var(--bg-base)', opacity: pending || !rawJson ? .55 : 1 }}>{pending ? 'Importando…' : 'Importar todo'}</button>}
        </div>
      </div>
    </ModalShell>
  </>
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}><span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>{title}</span><button type="button" aria-label="Cerrar" onClick={onClose} style={{ border: 0, background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={18} /></button></div>
}
