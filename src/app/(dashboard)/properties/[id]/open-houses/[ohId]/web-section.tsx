'use client'

import { useState } from 'react'
import { Check, Copy, ExternalLink, Globe, Sparkles } from 'lucide-react'
import { BTN_GHOST, CARD, HINT } from '../ui'

// Cómo se ve el open house en la web: la ficha alojada por ITMANO (y su
// embebible, que es la misma página) muestra la cuenta regresiva sola; para
// una web propia, el prompt que se le pega a una IA o a un desarrollador.

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => {})}
      style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
    >
      {copied ? <Check size={13} color="var(--accent-green)" /> : <Copy size={13} />}
      {copied ? 'Copiado' : label}
    </button>
  )
}

export function WebSection({
  isPublic, publicUrl, localPreviewUrl, integrationPrompt,
}: {
  isPublic:          boolean
  publicUrl:         string | null
  localPreviewUrl:   string | null
  integrationPrompt: string
}) {
  const [showPrompt, setShowPrompt] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>En la web</h2>

      <div style={{ ...CARD, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          <Globe size={14} /> Ficha alojada y embebible
        </div>
        {publicUrl ? (
          <>
            <div style={HINT}>
              {isPublic
                ? 'La cuenta regresiva y el botón para confirmar asistencia ya aparecen en la ficha pública de la propiedad y en su iframe embebido.'
                : 'Al confirmar el open house, la cuenta regresiva aparecerá sola en la ficha pública de la propiedad y en su iframe embebido.'}
            </div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <code style={{ fontSize: '12px', color: 'var(--accent-gold)', overflowWrap: 'anywhere' }}>{publicUrl}</code>
              {localPreviewUrl && (
                <a href={localPreviewUrl} target="_blank" rel="noopener noreferrer" style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none' }}>
                  <ExternalLink size={12} /> Ver página
                </a>
              )}
            </div>
          </>
        ) : (
          <div style={HINT}>
            La propiedad no está publicada en la web (o le falta el slug). Publícala desde su formulario para que la cuenta
            regresiva aparezca en la ficha pública.
          </div>
        )}
      </div>

      <div style={{ ...CARD, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
          <Sparkles size={14} /> En tu propia web
        </div>
        <div style={HINT}>
          Copia este prompt y pégaselo a la IA o al desarrollador de tu sitio. Tiene todo lo necesario para leer los open houses
          del CRM, mostrar la cuenta regresiva y recibir confirmaciones. Sirve para todas tus propiedades.
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <CopyButton text={integrationPrompt} label="Copiar prompt" />
          <button onClick={() => setShowPrompt(s => !s)} style={BTN_GHOST}>{showPrompt ? 'Ocultar' : 'Ver prompt'}</button>
        </div>
        {showPrompt && (
          <pre style={{ margin: 0, maxHeight: '360px', overflow: 'auto', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
            {integrationPrompt}
          </pre>
        )}
      </div>
    </div>
  )
}
