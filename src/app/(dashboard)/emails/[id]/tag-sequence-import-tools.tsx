'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Check, Clipboard, FileJson, Upload, X } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import {
  buildExternalEmailPrompt,
  MAX_EMAIL_IMPORT_BYTES,
} from '@/lib/email-sequence-import'
import {
  importTagSequenceSteps,
  type ImportSequenceStepsResult,
} from '../actions'

const SECONDARY_BUTTON: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '6px 12px',
  fontSize: '12px',
  fontWeight: 500,
  background: 'var(--bg-elevated)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  cursor: 'pointer',
}

function ModalHeader({ title, icon, onClose }: {
  title:   string
  icon:    React.ReactNode
  onClose: () => void
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
        {icon}
        {title}
      </span>
      <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
        <X size={18} />
      </button>
    </div>
  )
}

export function TagSequenceImportTools({
  sequenceId,
  sequenceName,
  language,
}: {
  sequenceId:   string
  sequenceName: string
  language:     string
}) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [modal, setModal] = useState<'prompt' | 'import' | null>(null)
  const [copied, setCopied] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [rawJson, setRawJson] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportSequenceStepsResult | null>(null)
  const [pending, startTransition] = useTransition()

  const prompt = buildExternalEmailPrompt({ sequenceName, language })

  function closeModal() {
    setModal(null)
    setCopied(false)
    setError(null)
    setResult(null)
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
    } catch {
      setError('No se pudo copiar automáticamente. Selecciona el prompt y cópialo manualmente.')
    }
  }

  async function chooseFile(file: File | undefined) {
    setError(null)
    setResult(null)
    setRawJson('')
    setFileName(file?.name ?? null)
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.json')) {
      setError('Selecciona un archivo con extensión .json.')
      return
    }
    if (file.size > MAX_EMAIL_IMPORT_BYTES) {
      setError('El archivo supera el límite de 1 MB.')
      return
    }
    try {
      setRawJson(await file.text())
    } catch {
      setError('No se pudo leer el archivo.')
    }
  }

  function importFile() {
    if (!rawJson) return
    setError(null)
    setResult(null)
    startTransition(async () => {
      const response = await importTagSequenceSteps(sequenceId, rawJson)
      if (!response.ok) {
        setError(response.error)
        return
      }
      setResult(response.result)
      router.refresh()
    })
  }

  return (
    <>
      <button type="button" onClick={() => setModal('prompt')} style={SECONDARY_BUTTON}>
        <Bot size={13} />
        Prompt para IA
      </button>
      <button
        type="button"
        onClick={() => setModal('import')}
        style={{ ...SECONDARY_BUTTON, color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.1)', borderColor: 'rgba(201,169,110,0.2)' }}
      >
        <Upload size={13} />
        Importar JSON
      </button>

      <ModalShell open={modal === 'prompt'} onClose={closeModal} maxWidth={720}>
        <div style={{ padding: '24px' }}>
          <ModalHeader title="Prompt para tu IA externa" icon={<Bot size={16} color="var(--accent-gold)" />} onClose={closeModal} />
          <p style={{ margin: '0 0 14px', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
            Copia este prompt en la IA que uses, añade el contexto comercial que te pida y guarda su respuesta como archivo <code>.json</code>.
          </p>
          <textarea
            readOnly
            value={prompt}
            rows={18}
            onFocus={event => event.currentTarget.select()}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-overlay)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: '11px', lineHeight: 1.55, outline: 'none' }}
          />
          {error && <div style={{ marginTop: '10px', color: 'var(--accent-coral)', fontSize: '12px' }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '14px' }}>
            <button type="button" onClick={copyPrompt} style={{ ...SECONDARY_BUTTON, color: copied ? 'var(--accent-green)' : 'var(--accent-gold)' }}>
              {copied ? <Check size={13} /> : <Clipboard size={13} />}
              {copied ? 'Prompt copiado' : 'Copiar prompt'}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={modal === 'import'} onClose={closeModal} maxWidth={620}>
        <div style={{ padding: '24px' }}>
          <ModalHeader title="Importar emails desde JSON" icon={<Upload size={16} color="var(--accent-gold)" />} onClose={closeModal} />
          <p style={{ margin: '0 0 16px', fontSize: '12px', lineHeight: 1.55, color: 'var(--text-muted)' }}>
            Se ordenan por hora acumulada. Los correos existentes y las horas ocupadas se conservan; los conflictos se omiten y aparecen en el resumen.
          </p>

          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            onChange={event => void chooseFile(event.target.files?.[0])}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{ width: '100%', minHeight: '92px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '7px', borderRadius: '10px', border: '1px dashed var(--border-accent)', background: 'rgba(201,169,110,0.04)', color: fileName ? 'var(--text-secondary)' : 'var(--text-muted)', cursor: 'pointer' }}
          >
            <FileJson size={20} color="var(--accent-gold)" />
            <span style={{ fontSize: '13px', fontWeight: 500 }}>{fileName ?? 'Seleccionar archivo JSON'}</span>
            <span style={{ fontSize: '11px' }}>Máximo 1 MB · hasta 100 emails</span>
          </button>

          {error && (
            <div style={{ marginTop: '12px', padding: '9px 11px', borderRadius: '7px', background: 'rgba(201,123,107,0.08)', color: 'var(--accent-coral)', fontSize: '12px', lineHeight: 1.45 }}>
              {error}
            </div>
          )}

          {result && (
            <div style={{ marginTop: '12px', padding: '11px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              <div style={{ color: result.imported > 0 ? 'var(--accent-green)' : 'var(--text-secondary)', fontWeight: 500 }}>
                {result.imported} {result.imported === 1 ? 'email importado' : 'emails importados'}.
                {result.reordered ? ' La secuencia quedó reordenada cronológicamente.' : ''}
              </div>
              {result.skipped.length > 0 && (
                <div style={{ marginTop: '7px' }}>
                  <strong>{result.skipped.length} omitidos:</strong>
                  <ul style={{ margin: '5px 0 0', paddingLeft: '18px', color: 'var(--text-muted)' }}>
                    {result.skipped.map((item, index) => (
                      <li key={`${item.sendAtHours}-${index}`}>
                        Hora {item.sendAtHours}, “{item.subject}”: {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button type="button" onClick={closeModal} style={SECONDARY_BUTTON}>
              {result ? 'Cerrar' : 'Cancelar'}
            </button>
            {!result && (
              <button
                type="button"
                onClick={importFile}
                disabled={pending || !rawJson}
                style={{ ...SECONDARY_BUTTON, background: 'var(--accent-gold)', color: 'var(--bg-base)', borderColor: 'var(--accent-gold)', opacity: pending || !rawJson ? 0.55 : 1, cursor: pending || !rawJson ? 'not-allowed' : 'pointer' }}
              >
                <Upload size={13} />
                {pending ? 'Importando…' : 'Importar emails'}
              </button>
            )}
          </div>
        </div>
      </ModalShell>
    </>
  )
}
