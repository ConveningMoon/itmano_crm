'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Code2, Copy, ExternalLink, Globe, Send, ShieldCheck } from 'lucide-react'
import { hostedPropertiesUrl } from '@/lib/hosted-page'
import { requestPageBuild, setPageManagedByItmano } from '../../sources/actions'

// Tab "Página" de una propiedad: cómo se publica en la web.
//   1. Catálogo alojado por ITMANO (properties.itmano.com/<tenant>) — la
//      propiedad aparece cuando está "Publicada en web" (formulario de edición).
//   2. Embebible en la web propia (iframe del catálogo o del detalle).
//   3. Solicitar la página a ITMANO (→ /solicitudes, tab Páginas).
// page_managed_by_itmano (super_admin) oculta todo esto al tenant.

const BTN_GHOST: React.CSSProperties = {
  padding: '7px 14px', fontSize: '12px', color: 'var(--text-muted)',
  background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
}
const BTN_PRIMARY: React.CSSProperties = {
  padding: '8px 18px', fontSize: '13px', fontWeight: 500, color: 'var(--bg-base)',
  background: 'var(--accent-gold)', border: 'none', borderRadius: '8px', cursor: 'pointer',
}
const CARD: React.CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px',
}

type Mode = 'hosted' | 'embed' | 'request'

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => {})}
      style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
    >
      {copied ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
      {copied ? 'Copiado' : 'Copiar'}
    </button>
  )
}

export function PropertyPageOptions({
  propertyId, propertyName, tenantSlug, propertySlug, published, managedByItmano, isSuperAdmin,
}: {
  propertyId: string
  propertyName: string
  tenantSlug: string
  propertySlug: string | null
  published: boolean
  managedByItmano: boolean
  isSuperAdmin: boolean
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('hosted')
  const [reqMsg, setReqMsg]   = useState('')
  const [reqDone, setReqDone] = useState(false)
  const [reqErr, setReqErr]   = useState<string | null>(null)
  const [pending, start]      = useTransition()

  const catalogUrl = hostedPropertiesUrl(tenantSlug)
  const detailUrl  = propertySlug ? `${catalogUrl}/${propertySlug}` : null

  function toggleManaged(next: boolean) {
    start(async () => {
      const res = await setPageManagedByItmano('property', propertyId, next)
      if (res.ok) router.refresh()
    })
  }

  if (managedByItmano) {
    return (
      <div style={{ ...CARD, padding: '20px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <ShieldCheck size={18} color="var(--accent-green)" />
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Página conectada por ITMANO</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            La publicación web de esta propiedad la gestiona el equipo de ITMANO.
          </div>
        </div>
        {isSuperAdmin && (
          <button onClick={() => toggleManaged(false)} disabled={pending} style={BTN_GHOST}>
            Quitar marca (mostrar opciones)
          </button>
        )}
      </div>
    )
  }

  const modes: { key: Mode; icon: React.ReactNode; title: string; desc: string }[] = [
    { key: 'hosted',  icon: <Globe size={16} />, title: 'Catálogo alojado por ITMANO', desc: 'Tu catálogo público vive en un subdominio de ITMANO. Publica la propiedad desde su formulario y aparece sola.' },
    { key: 'embed',   icon: <Code2 size={16} />, title: 'Embebible en tu web', desc: 'Pega un código en tu sitio y muestra el catálogo (o esta propiedad) siempre actualizado desde el CRM.' },
    { key: 'request', icon: <Send size={16} />,  title: 'Solicitar a ITMANO', desc: 'Nuestro equipo crea o conecta la página de propiedades por ti.' },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {modes.map(m => {
          const active = mode === m.key
          return (
            <button key={m.key} onClick={() => setMode(m.key)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '16px',
                background: active ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                borderRadius: '12px',
              }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: active ? 'var(--accent-gold)' : 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
                {m.icon} {m.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '8px' }}>{m.desc}</div>
            </button>
          )
        })}
      </div>

      {isSuperAdmin && (
        <button onClick={() => toggleManaged(true)} disabled={pending} style={{ ...BTN_GHOST, alignSelf: 'flex-start' }}>
          <ShieldCheck size={12} style={{ verticalAlign: '-2px', marginRight: '5px' }} />
          Marcar como conectada por ITMANO (ocultar opciones al tenant)
        </button>
      )}

      {mode === 'hosted' && (
        <div style={{ ...CARD, padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Estado: {published
              ? <span style={{ color: 'var(--accent-green)', fontWeight: 500 }}>publicada en el catálogo web</span>
              : <span style={{ color: 'var(--accent-coral)', fontWeight: 500 }}>no publicada</span>}.
            {' '}La publicación se controla con &quot;Publicar en web&quot; en el formulario de edición de la propiedad
            (necesita nombre, slug y foto para verse bien).
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <code style={{ fontSize: '12px', color: 'var(--accent-gold)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
              {detailUrl ?? catalogUrl}
            </code>
            <CopyBtn text={detailUrl ?? catalogUrl} />
            <a href={propertySlug ? `/web/${tenantSlug}/${propertySlug}` : `/web/${tenantSlug}`} target="_blank" rel="noopener noreferrer"
              style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px', textDecoration: 'none' }}>
              <ExternalLink size={12} /> Ver página
            </a>
          </div>
        </div>
      )}

      {mode === 'embed' && (
        <div style={{ ...CARD, padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Pega este código en tu sitio (Wix, WordPress, Squarespace, Webflow) para mostrar el
            <strong> catálogo completo</strong> siempre sincronizado con el CRM:
          </div>
          <pre style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', fontSize: '12px', color: 'var(--text-secondary)', overflowX: 'auto', margin: 0 }}>
{`<iframe src="${catalogUrl}"
  style="width:100%;min-height:1100px;border:0;border-radius:12px;"
  loading="lazy" title="Propiedades"></iframe>`}
          </pre>
          <div><CopyBtn text={`<iframe src="${catalogUrl}" style="width:100%;min-height:1100px;border:0;border-radius:12px;" loading="lazy" title="Propiedades"></iframe>`} /></div>
          {detailUrl && (
            <>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6, marginTop: '4px' }}>
                O solo <strong>esta propiedad</strong>:
              </div>
              <pre style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', fontSize: '12px', color: 'var(--text-secondary)', overflowX: 'auto', margin: 0 }}>
{`<iframe src="${detailUrl}"
  style="width:100%;min-height:1100px;border:0;border-radius:12px;"
  loading="lazy" title="${propertyName}"></iframe>`}
              </pre>
              <div><CopyBtn text={`<iframe src="${detailUrl}" style="width:100%;min-height:1100px;border:0;border-radius:12px;" loading="lazy" title="${propertyName}"></iframe>`} /></div>
            </>
          )}
        </div>
      )}

      {mode === 'request' && (
        <div style={{ ...CARD, padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reqDone ? (
            <div style={{ fontSize: '13px', color: 'var(--accent-green)' }}>
              Solicitud enviada. Nuestro equipo te contactará.
            </div>
          ) : (
            <>
              <textarea
                rows={4}
                value={reqMsg}
                onChange={e => setReqMsg(e.target.value)}
                placeholder="Cuéntanos qué necesitas para la página de propiedades (web nueva, conectar tu web actual, diseño especial…)"
                style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              {reqErr && <div style={{ fontSize: '12px', color: '#E04040' }}>{reqErr}</div>}
              <button
                onClick={() => {
                  setReqErr(null)
                  start(async () => {
                    const res = await requestPageBuild({ subject: `Página de propiedades: ${propertyName}`, message: reqMsg })
                    if (!res.ok) { setReqErr(res.error); return }
                    setReqDone(true)
                  })
                }}
                disabled={pending}
                style={{ ...BTN_PRIMARY, alignSelf: 'flex-start', opacity: pending ? 0.6 : 1 }}
              >
                {pending ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
