'use client'

import { useMemo, useState, useTransition } from 'react'
import { Check, AlertTriangle } from 'lucide-react'
import { MAX_SOURCE_DOMAINS, parseSourceDomains } from '@/lib/newsletters/source-domains'
import { updateNewsletterSourceDomains } from './actions'

// La allowlist que la IA puede consultar al escribir una newsletter. Es lo que
// hace verificable al contenido generado: un dato que no esté aquí no se
// encuentra, así que no se puede citar. Por eso sólo ITMANO la edita — mismo
// criterio que la pestaña de Scoring — y el resto del equipo la ve, pero no
// puede tocarla.

const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '12px',
  overflow: 'hidden',
}
const HEAD: React.CSSProperties = { padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }
const BODY: React.CSSProperties = { padding: '18px 20px' }
const HINT: React.CSSProperties = { fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.5 }
const TEXTAREA: React.CSSProperties = {
  width: '100%', minHeight: '160px', padding: '10px 12px', borderRadius: '8px',
  border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)',
  color: 'var(--text-primary)', fontSize: '13px', fontFamily: 'inherit',
  lineHeight: 1.6, resize: 'vertical', boxSizing: 'border-box',
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/

/**
 * Explica en español por qué una entrada no pasó `normalizeDomain`.
 *
 * Espeja sus mismos pasos de limpieza SOLO para clasificar el motivo — la
 * decisión de qué se acepta sigue siendo, siempre, `parseSourceDomains`. Esto
 * nunca decide, sólo describe lo que ya decidió.
 */
function reasonForRejection(raw: string): string {
  let v = raw.trim().toLowerCase()
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
  v = v.split('/')[0].split('?')[0].split('#')[0]
  v = v.replace(/:\d+$/, '')
  v = v.replace(/\.$/, '')

  if (IPV4.test(v)) return 'no puede ser una dirección IP'
  if (!v.includes('.')) return 'falta el dominio (agrega la extensión, por ejemplo .com)'
  return 'el formato del dominio no es válido'
}

function linesToEntries(text: string): string[] {
  return text.split('\n')
}

export function NewsletterSourcesSection({ domains, canEdit }: { domains: string[]; canEdit: boolean }) {
  const [text, setText]   = useState(() => domains.join('\n'))
  const [saved, setSaved] = useState(() => domains.join('\n'))
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk]       = useState(false)
  const [pending, start]  = useTransition()

  // Vista previa en vivo: lo que se guardaría si guardas ahora, incluyendo lo
  // que se va a rechazar. Se recalcula con cada tecla, sobre el borrador.
  const preview = useMemo(() => parseSourceDomains(linesToEntries(text)), [text])
  const dirty = text !== saved

  function guardar() {
    setError(null); setOk(false)
    start(async () => {
      const res = await updateNewsletterSourceDomains(linesToEntries(text))
      if (!res.ok) { setError(res.error); return }
      const normalizado = res.data.domains.join('\n')
      setText(normalizado)
      setSaved(normalizado)
      setOk(true)
    })
  }

  return (
    <div style={CARD}>
      <div style={HEAD}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          Fuentes para newsletters con IA
        </span>
        <div style={HINT}>
          La IA solo podrá consultar estas fuentes al escribir tus newsletters. Sin
          fuentes declaradas, no puede generar contenido nuevo — es preferible eso a
          que busque en cualquier sitio.
        </div>
      </div>

      <div style={BODY}>
        {canEdit ? (
          <>
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); setOk(false); setError(null) }}
              rows={10}
              placeholder={'nar.realtor\nzillow.com\nhttps://www.idealista.com/noticias'}
              style={TEXTAREA}
            />
            <div style={HINT}>Una fuente por línea. Puedes pegar la URL completa: solo se guarda el dominio.</div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                {preview.domains.length} / {MAX_SOURCE_DOMAINS}
              </span>
            </div>

            {preview.rejected.length > 0 && (
              <div style={{
                marginTop: '10px', padding: '10px 12px', borderRadius: '8px',
                background: 'color-mix(in srgb, var(--accent-coral) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent-coral) 25%, transparent)',
              }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--accent-coral)', marginBottom: '6px' }}>
                  <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>Estas entradas no se van a guardar:</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                  {preview.rejected.map((r, i) => (
                    <li key={`${r}-${i}`}><strong>{r}</strong> — {reasonForRejection(r)}</li>
                  ))}
                </ul>
              </div>
            )}

            {error && <div style={{ fontSize: '12px', color: 'var(--accent-coral)', marginTop: '10px' }}>{error}</div>}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '14px' }}>
              <button
                onClick={guardar}
                disabled={pending || !dirty}
                style={{
                  padding: '9px 18px', borderRadius: '8px', border: 'none',
                  background: 'var(--accent-gold)', color: '#1a1a1a',
                  fontSize: '13px', fontWeight: 500,
                  cursor: (pending || !dirty) ? 'default' : 'pointer', opacity: (pending || !dirty) ? 0.6 : 1,
                }}
              >
                {pending ? 'Guardando…' : 'Guardar fuentes'}
              </button>
              {ok && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: 'var(--accent-green)' }}>
                  <Check size={14} /> Guardado
                </span>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{
              fontSize: '12px', color: 'var(--text-muted)', padding: '10px 12px', marginBottom: '14px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px',
              lineHeight: 1.5,
            }}>
              Las fuentes las fija ITMANO. Si tu equipo necesita agregar o quitar una, escríbenos y lo evaluamos.
            </div>
            {domains.length > 0 ? (
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.8 }}>
                {domains.map(d => <li key={d}>{d}</li>)}
              </ul>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                Todavía no hay fuentes declaradas para este equipo.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}
