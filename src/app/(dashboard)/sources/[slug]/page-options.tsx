'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Code2, Copy, Globe, Send, ShieldCheck } from 'lucide-react'
import { hostedChannelUrl, type HostedPageConfig } from '@/lib/hosted-page'
import { requestPageBuild, setPageManagedByItmano } from '../actions'
import { HostedPageEditor } from './hosted-page-editor'

// Tab "Página" de una fuente: cómo se crea la landing de este canal.
//   1. Alojada por ITMANO (constructor — default recomendado)
//   2. Embebible en la web propia (iframe + contrato de campos del intake)
//   3. Solicitar la creación a ITMANO (→ /solicitudes, tab Páginas)
// Si el super_admin marcó la página como conectada manualmente
// (page_managed_by_itmano), el tenant no ve las opciones de construcción.

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

const MODES: { key: Mode; icon: React.ReactNode; title: string; desc: string }[] = [
  { key: 'hosted',  icon: <Globe size={16} />, title: 'Página alojada por ITMANO', desc: 'La construyes aquí con el constructor y queda publicada en un subdominio de ITMANO. Sin configuración técnica. Recomendada.' },
  { key: 'embed',   icon: <Code2 size={16} />, title: 'Embebible en tu web', desc: 'Ya tienes sitio (Wix, WordPress, Squarespace…): pega un código y el formulario vive en tu página, conectado al CRM.' },
  { key: 'request', icon: <Send size={16} />,  title: 'Solicitar a ITMANO', desc: 'Nuestro equipo diseña y conecta la página por ti. Cuéntanos qué necesitas y te contactamos.' },
]

function CopyBtn({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) }).catch(() => {})}
      style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '4px 10px' }}
    >
      {copied ? <Check size={12} color="var(--accent-green)" /> : <Copy size={12} />}
      {copied ? 'Copiado' : label}
    </button>
  )
}

export function PageOptions({
  channelId, channelType, channelName, publicId, tenantSlug, channelSlug,
  initial, managedByItmano, isSuperAdmin, canEdit, tenantName, agentName,
}: {
  channelId: string
  channelType: string
  channelName: string
  publicId: string
  tenantSlug: string
  channelSlug: string
  initial: HostedPageConfig | null
  managedByItmano: boolean
  isSuperAdmin: boolean
  canEdit: boolean
  tenantName?: string
  agentName?: string | null
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('hosted')
  const [reqMsg, setReqMsg]   = useState('')
  const [reqDone, setReqDone] = useState(false)
  const [reqErr, setReqErr]   = useState<string | null>(null)
  const [pending, start]      = useTransition()

  const url = hostedChannelUrl(channelType, tenantSlug, channelSlug)

  function toggleManaged(next: boolean) {
    start(async () => {
      const res = await setPageManagedByItmano('channel', channelId, next)
      if (res.ok) router.refresh()
    })
  }

  // ── Conectada manualmente por ITMANO ────────────────────────────────────────
  if (managedByItmano) {
    return (
      <div style={{ ...CARD, padding: '20px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <ShieldCheck size={18} color="var(--accent-green)" />
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Página conectada por ITMANO</div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
            La página de este canal la gestiona el equipo de ITMANO. Si necesitas un cambio, escríbenos desde Soporte.
          </div>
        </div>
        {isSuperAdmin && (
          <button onClick={() => toggleManaged(false)} disabled={pending} style={BTN_GHOST}>
            Quitar marca (mostrar constructor)
          </button>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Selector de opción */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
        {MODES.map(m => {
          const active = mode === m.key
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              style={{
                textAlign: 'left', cursor: 'pointer', padding: '16px',
                background: active ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                borderRadius: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: active ? 'var(--accent-gold)' : 'var(--text-primary)', fontSize: '13px', fontWeight: 600 }}>
                {m.icon} {m.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, marginTop: '8px' }}>{m.desc}</div>
            </button>
          )
        })}
      </div>

      {/* super_admin: marcar como conectada manualmente */}
      {isSuperAdmin && (
        <button onClick={() => toggleManaged(true)} disabled={pending} style={{ ...BTN_GHOST, alignSelf: 'flex-start' }}>
          <ShieldCheck size={12} style={{ verticalAlign: '-2px', marginRight: '5px' }} />
          Marcar como conectada por ITMANO (ocultar constructor al tenant)
        </button>
      )}

      {/* ── Opción 1: constructor ── */}
      {mode === 'hosted' && (
        <HostedPageEditor
          channelId={channelId}
          channelType={channelType}
          tenantSlug={tenantSlug}
          channelSlug={channelSlug}
          initial={initial}
          canEdit={canEdit}
          tenantName={tenantName}
          agentName={agentName}
        />
      )}

      {/* ── Opción 2: embebible ── */}
      {mode === 'embed' && (
        <div style={{ ...CARD, padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>Embeber en tu sitio web</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>
              La forma recomendada es el <strong>iframe</strong>: usa la misma página del constructor (configúrala primero
              en la opción 1 y publícala), conserva el scoring y las secuencias intactos, y se actualiza sola.
              Wix, WordPress, Squarespace y Webflow aceptan bloques de código HTML.
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
              Código para pegar
            </div>
            <pre style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', fontSize: '12px', color: 'var(--text-secondary)', overflowX: 'auto', margin: 0 }}>
{`<iframe src="${url}"
  style="width:100%;min-height:920px;border:0;border-radius:12px;"
  loading="lazy" title="${channelName}"></iframe>`}
            </pre>
            <div style={{ marginTop: '8px' }}>
              <CopyBtn text={`<iframe src="${url}" style="width:100%;min-height:920px;border:0;border-radius:12px;" loading="lazy" title="${channelName}"></iframe>`} label="Copiar código" />
            </div>
          </div>

          {channelType !== 'contact_form' && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                Formulario 100% propio (avanzado)
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.6 }}>
                Tu desarrollador puede construir el formulario como quiera. Solo tiene que hacer un
                <strong> POST</strong> con las respuestas a este endpoint — el CRM las interpreta con IA, así que
                el <code>form_answers</code> puede tener las preguntas y opciones que definas, sin claves fijas.
              </div>

              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 6px' }}>
                Endpoint
              </div>
              <pre style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', fontSize: '11.5px', color: 'var(--accent-gold)', overflowX: 'auto', margin: 0 }}>
{`POST https://app.itmano.com/api/intake/${publicId}/submit
Content-Type: application/json`}
              </pre>
              <div style={{ marginTop: '8px' }}>
                <CopyBtn text={`https://app.itmano.com/api/intake/${publicId}/submit`} label="Copiar endpoint" />
              </div>

              <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '16px 0 6px' }}>
                Reglas obligatorias
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                <li><strong>Obligatorios:</strong> <code>first_name</code> y <code>email</code>.</li>
                <li><strong>Anti-spam:</strong> incluye un campo <code>website</code> (honeypot) y envíalo SIEMPRE vacío.</li>
                <li><strong>Respuestas:</strong> <code>form_answers</code> es un arreglo libre de objetos
                  {' '}<code>{'{ key, question, value, label }'}</code> — las preguntas y opciones las eliges tú.</li>
                <li><strong>Opcionales:</strong> <code>last_name</code>, <code>phone</code>, <code>language</code> (es·en·pt),
                  {' '}<code>visitor_id</code> (métricas) y <code>source_url</code>.</li>
              </ul>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.6 }}>
                Respuesta: <code>{'{ "ok": true, "status": "created" | "already_submitted" }'}</code>.
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Opción 3: solicitar a ITMANO ── */}
      {mode === 'request' && (
        <div style={{ ...CARD, padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {reqDone ? (
            <div style={{ fontSize: '13px', color: 'var(--accent-green)' }}>
              Solicitud enviada. Nuestro equipo te contactará para diseñar y conectar la página.
            </div>
          ) : (
            <>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Cuéntanos qué necesitas para la página de <strong>{channelName}</strong>: objetivo, materiales que ya
                tienes (fotos, textos, PDF), y cualquier referencia de estilo.
              </div>
              <textarea
                rows={4}
                value={reqMsg}
                onChange={e => setReqMsg(e.target.value)}
                placeholder="Ej.: Quiero una landing para mi guía de compradores; tengo la portada y el PDF listos…"
                style={{ width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 12px', fontSize: '13px', color: 'var(--text-primary)', outline: 'none', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
              />
              {reqErr && <div style={{ fontSize: '12px', color: '#E04040' }}>{reqErr}</div>}
              <button
                onClick={() => {
                  setReqErr(null)
                  start(async () => {
                    const res = await requestPageBuild({ subject: `Página para canal: ${channelName}`, message: reqMsg })
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
