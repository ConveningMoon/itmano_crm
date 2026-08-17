'use client'

import { useState, useTransition } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { createStudioImage } from './actions'
import { Field, TextArea, Select } from './field-inputs'
import { ReferencePicker, revokeReferences, type ReferenceItem } from './reference-picker'
import type { StudioImage } from '@/lib/studio/types'

// "Mi Imagen" — cualquier imagen, descrita con palabras.
//
// Es el reverso de la pestaña de Posts: allí el CRM sabe qué va escrito y solo
// pide los datos; aquí no sabe nada y el prompt manda. Por eso no hay diseño,
// ni paleta, ni estilo — todo eso son decisiones que el usuario ya está tomando
// al escribir. La imagen sale tal cual la devuelve el modelo: el compositor no
// dibuja nada encima.

const ASPECTS = [
  { value: '4:5',  label: '4:5 · feed alto' },
  { value: '1:1',  label: '1:1 · feed cuadrado' },
  { value: '9:16', label: '9:16 · story' },
]

export function FreeImageForm({ onCreated }: { onCreated: (image: StudioImage) => void }) {
  const [prompt, setPrompt] = useState('')
  const [aspect, setAspect] = useState('4:5')
  const [references, setReferences] = useState<ReferenceItem[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const data = new FormData()
    data.set('payload', JSON.stringify({
      recipe: 'open_prompt',
      prompt,
      aspect,
      reference_count: references.length,
    }))
    // Todas bajo la misma clave: el servidor las lee con getAll y conserva el
    // orden, que es el que el prompt referencia ("la primera", "la segunda").
    for (const item of references) data.append('reference', item.file)

    startTransition(async () => {
      const r = await createStudioImage(data)
      if (r.ok) {
        onCreated(r.data)
        setPrompt('')
        revokeReferences(references)
        setReferences([])
      } else setError(r.error)
    })
  }

  return (
    <div>
      <style>{`
        .studio-generate:hover:not(:disabled) { background: var(--accent-gold) !important; color: var(--bg-base) !important; }
      `}</style>

      <Field
        label="Qué quieres ver"
        hint="Descríbelo con detalle: qué aparece, con qué luz y desde dónde se mira."
      >
        <TextArea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          maxLength={800}
          placeholder="Una llave dorada sobre una mesa de mármol, luz lateral de ventana, fondo desenfocado en tonos cálidos"
          style={{ minHeight: '132px' }}
        />
      </Field>

      <Field label="Proporción">
        <Select value={aspect} onChange={e => setAspect(e.target.value)} options={ASPECTS} />
      </Field>

      <ReferencePicker files={references} onChange={setReferences} />

      {error && (
        <p style={{ fontSize: '12px', color: 'var(--status-lost, #c96b6b)', margin: '0 0 12px' }}>{error}</p>
      )}

      <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
        Cada imagen se genera con IA y consume presupuesto de generación.
      </p>

      <button
        type="button"
        className="studio-generate"
        disabled={pending || prompt.trim().length < 3}
        onClick={submit}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', padding: '11px', fontSize: '13px', fontWeight: 500,
          borderRadius: '8px', cursor: pending || prompt.trim().length < 3 ? 'default' : 'pointer',
          background: 'transparent', border: '1px solid var(--accent-gold)',
          color: 'var(--accent-gold)', opacity: pending || prompt.trim().length < 3 ? 0.6 : 1,
          transition: 'background-color var(--dur-fast), color var(--dur-fast)',
        }}
      >
        {pending
          ? <><Loader2 size={14} className="animate-spin" /> Generando…</>
          : <><Sparkles size={14} /> Generar imagen</>}
      </button>
    </div>
  )
}
