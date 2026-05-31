'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Plus, Copy, Check, X } from 'lucide-react'
import type { ChannelWithMetrics, ChannelType } from '@/lib/data/channels'
import { createLeadMagnet, createEvent } from './actions'

// ─── Constants ────────────────────────────────────────────────────────────────

const WINDOWS = [
  { value: 7,  label: '7 días' },
  { value: 30, label: '30 días' },
  { value: 90, label: '90 días' },
]

const CHANNEL_TYPE_LABELS: Record<ChannelType, string> = {
  lead_magnet:   'Lead Magnet',
  event:         'Evento',
  contact_form:  'Formulario',
  manychat_flow: 'ManyChat',
  manual:        'Manual',
}

const CHANNEL_TYPE_COLORS: Record<ChannelType, string> = {
  lead_magnet:   'var(--accent-gold)',
  event:         'var(--accent-teal)',
  contact_form:  'var(--accent-blue)',
  manychat_flow: 'var(--accent-green)',
  manual:        'var(--text-muted)',
}

const TAB_FILTERS: Array<{ value: ChannelType | 'all'; label: string }> = [
  { value: 'all',          label: 'Todos' },
  { value: 'lead_magnet',  label: 'Lead Magnets' },
  { value: 'event',        label: 'Eventos' },
  { value: 'contact_form', label: 'Formularios' },
  { value: 'manychat_flow',label: 'ManyChat' },
  { value: 'manual',       label: 'Manual' },
]

// ─── Channel Card ─────────────────────────────────────────────────────────────

function ChannelCard({ ch }: { ch: ChannelWithMetrics }) {
  const typeColor = CHANNEL_TYPE_COLORS[ch.channelType]
  const typeLabel = CHANNEL_TYPE_LABELS[ch.channelType]

  return (
    <div
      className="source-card"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        overflow: 'hidden',
        borderTop: `3px solid ${typeColor}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div style={{
        background: 'var(--bg-elevated)',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{
          fontSize: '10px',
          fontWeight: 500,
          color: typeColor,
          background: `${typeColor}18`,
          padding: '2px 8px',
          borderRadius: '10px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          {typeLabel}
        </span>
        <span style={{
          fontSize: '10px',
          fontWeight: 500,
          color: ch.active ? 'var(--accent-green)' : 'var(--text-muted)',
          background: ch.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-overlay)',
          padding: '2px 8px',
          borderRadius: '10px',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
        }}>
          {ch.active ? 'Activo' : 'Inactivo'}
        </span>
      </div>

      {/* Body */}
      <div style={{ padding: '16px', flex: 1 }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
          {ch.name}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px', fontFamily: 'monospace', letterSpacing: '0.02em' }}>
          {ch.publicId}
        </div>

        {/* Metrics 2×2 grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1px',
          background: 'var(--border-subtle)',
          borderRadius: '8px',
          overflow: 'hidden',
          marginBottom: '12px',
        }}>
          {[
            { value: ch.metrics.leadsInWindow, label: 'Leads' },
            { value: ch.metrics.pageViewsInWindow, label: 'Vistas' },
            { value: `${ch.metrics.conversionRate}%`, label: 'Conversión' },
            { value: ch.metrics.avgTempScore !== null ? ch.metrics.avgTempScore : '—', label: 'Score prom.' },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--bg-elevated)', padding: '10px 14px' }}>
              <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                {s.value}
              </div>
              <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginTop: '2px' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Email sequence indicator */}
        {ch.emailSequenceId && (
          <div style={{ fontSize: '11px', color: 'var(--accent-teal)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-teal)', display: 'inline-block' }} />
            Secuencia de emails activa
          </div>
        )}

        {/* All-time total */}
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
          {ch.metrics.leadsTotal} leads en total
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <Link
          href={`/leads?channel=${ch.id}`}
          style={{ fontSize: '12px', color: 'var(--accent-gold)', textDecoration: 'none', fontWeight: 500 }}
        >
          Ver leads →
        </Link>
        <Link
          href={`/sources/${ch.slug}`}
          className="detail-link"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            textDecoration: 'none',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '5px 10px',
            transition: 'border-color 0.15s, color 0.15s',
          }}
        >
          Ver detalle
        </Link>
      </div>
    </div>
  )
}

// ─── Style constants ──────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '9px 12px',
  fontSize: '13px',
  color: 'var(--text-primary)',
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

const BTN_PRIMARY: React.CSSProperties = {
  padding: '9px 18px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--bg-base)',
  background: 'var(--accent-gold)',
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
}

const BTN_GHOST: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: '13px',
  color: 'var(--text-muted)',
  background: 'transparent',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  cursor: 'pointer',
}

// ─── Snippet copy block ────────────────────────────────────────────────────────

function SnippetBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ position: 'relative', marginTop: '6px' }}>
      <pre style={{
        background: 'var(--bg-overlay)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '8px',
        padding: '12px',
        fontSize: '11px',
        color: 'var(--text-secondary)',
        overflowX: 'auto',
        margin: 0,
        fontFamily: 'monospace',
        lineHeight: 1.5,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
      }}>
        {code}
      </pre>
      <button
        onClick={copy}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          background: copied ? 'var(--accent-green)' : 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '6px',
          padding: '4px 8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: copied ? '#fff' : 'var(--text-muted)',
        }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? 'Copiado' : 'Copiar'}
      </button>
    </div>
  )
}

// ─── Lead Magnet modal ─────────────────────────────────────────────────────────

function LeadMagnetModal({ onClose, isSuperAdmin, tenants }: {
  onClose:     () => void
  isSuperAdmin: boolean
  tenants:     Array<{ id: string; name: string }>
}) {
  const [name,     setName]     = useState('')
  const [slug,     setSlug]     = useState('')
  const [lpUrl,    setLpUrl]    = useState('')
  const [fileUrl,  setFileUrl]  = useState('')
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? '')
  const [error,    setError]    = useState<string | null>(null)
  const [result,   setResult]   = useState<{ publicId: string; slug: string; sequenceId: string; embedSnippet: string } | null>(null)
  const [pending,  startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await createLeadMagnet({
        name, slug: slug || undefined, lpUrl: lpUrl || undefined, fileUrl: fileUrl || undefined,
        tenantId: isSuperAdmin ? tenantId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setResult({ publicId: res.publicId, slug: res.slug, sequenceId: res.sequenceId, embedSnippet: res.embedSnippet })
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        {/* Modal header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {result ? 'Lead Magnet creado' : 'Nuevo Lead Magnet'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {!result ? (
            <>
              {isSuperAdmin && (
                <div>
                  <label style={LABEL}>Tenant <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
                  <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={LABEL}>Nombre *</label>
                <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="Ej. Guía para Primeros Compradores" autoFocus />
              </div>
              <div>
                <label style={LABEL}>Slug <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional — se genera del nombre)</span></label>
                <input value={slug} onChange={e => setSlug(e.target.value)} style={INPUT} placeholder="guia-primeros-compradores" />
              </div>
              <div>
                <label style={LABEL}>URL de la landing page <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
                <input value={lpUrl} onChange={e => setLpUrl(e.target.value)} style={INPUT} placeholder="https://..." type="url" />
              </div>
              <div>
                <label style={LABEL}>URL del recurso descargable <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
                <input value={fileUrl} onChange={e => setFileUrl(e.target.value)} style={INPUT} placeholder="https://drive.google.com/..." type="url" />
              </div>

              {error && (
                <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
                <button onClick={handleSubmit} disabled={!name.trim() || pending || (isSuperAdmin && !tenantId)} style={{ ...BTN_PRIMARY, opacity: (!name.trim() || pending || (isSuperAdmin && !tenantId)) ? 0.6 : 1 }}>
                  {pending ? 'Creando…' : 'Crear Lead Magnet'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '10px 14px', background: 'rgba(107,163,104,0.08)', border: '1px solid rgba(107,163,104,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--accent-green)' }}>
                Lead magnet creado y secuencia de email iniciada.
              </div>

              <div>
                <label style={LABEL}>ID público</label>
                <code style={{ fontSize: '13px', color: 'var(--accent-gold)', fontFamily: 'monospace' }}>{result.publicId}</code>
              </div>
              <div>
                <label style={LABEL}>Slug</label>
                <code style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>/sources/{result.slug}</code>
              </div>

              <div>
                <label style={LABEL}>Snippet de seguimiento de vistas (pegarlo en el <code style={{ textTransform: 'none', letterSpacing: 0 }}>&lt;head&gt;</code> de la landing)</label>
                <SnippetBlock code={result.embedSnippet} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button onClick={onClose} style={BTN_PRIMARY}>Listo</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Event modal ───────────────────────────────────────────────────────────────

function EventModal({ onClose, isSuperAdmin, tenants }: {
  onClose:      () => void
  isSuperAdmin: boolean
  tenants:      Array<{ id: string; name: string }>
}) {
  const [name,      setName]      = useState('')
  const [slug,      setSlug]      = useState('')
  const [eventDate, setEventDate] = useState('')
  const [location,  setLocation]  = useState('')
  const [tenantId,  setTenantId]  = useState(tenants[0]?.id ?? '')
  const [error,     setError]     = useState<string | null>(null)
  const [result,    setResult]    = useState<{ publicId: string; slug: string; formSnippet: string } | null>(null)
  const [pending,   startTransition] = useTransition()

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const res = await createEvent({
        name, slug: slug || undefined, eventDate: eventDate || undefined, location: location || undefined,
        tenantId: isSuperAdmin ? tenantId : undefined,
      })
      if (!res.ok) { setError(res.error); return }
      setResult({ publicId: res.publicId, slug: res.slug, formSnippet: res.formSnippet })
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }}>
      <div style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '90vh',
        overflowY: 'auto',
      }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {result ? 'Evento creado' : 'Nuevo Evento'}
          </span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {!result ? (
            <>
              {isSuperAdmin && (
                <div>
                  <label style={LABEL}>Tenant <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
                  <select value={tenantId} onChange={e => setTenantId(e.target.value)} style={{ ...INPUT, appearance: 'none', cursor: 'pointer' }}>
                    {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label style={LABEL}>Nombre del evento *</label>
                <input value={name} onChange={e => setName(e.target.value)} style={INPUT} placeholder="Ej. Open House Virginia Beach Jun 2026" autoFocus />
              </div>
              <div>
                <label style={LABEL}>Slug <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opcional)</span></label>
                <input value={slug} onChange={e => setSlug(e.target.value)} style={INPUT} placeholder="open-house-vb-jun-2026" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={LABEL}>Fecha del evento <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opc.)</span></label>
                  <input value={eventDate} onChange={e => setEventDate(e.target.value)} style={INPUT} type="date" />
                </div>
                <div>
                  <label style={LABEL}>Ubicación <span style={{ color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>(opc.)</span></label>
                  <input value={location} onChange={e => setLocation(e.target.value)} style={INPUT} placeholder="Virginia Beach, VA" />
                </div>
              </div>

              {error && (
                <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
                <button onClick={handleSubmit} disabled={!name.trim() || pending || (isSuperAdmin && !tenantId)} style={{ ...BTN_PRIMARY, opacity: (!name.trim() || pending || (isSuperAdmin && !tenantId)) ? 0.6 : 1 }}>
                  {pending ? 'Creando…' : 'Crear Evento'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '10px 14px', background: 'rgba(107,163,104,0.08)', border: '1px solid rgba(107,163,104,0.2)', borderRadius: '8px', fontSize: '13px', color: 'var(--accent-green)' }}>
                Evento creado correctamente.
              </div>

              <div>
                <label style={LABEL}>ID público</label>
                <code style={{ fontSize: '13px', color: 'var(--accent-gold)', fontFamily: 'monospace' }}>{result.publicId}</code>
              </div>
              <div>
                <label style={LABEL}>Slug</label>
                <code style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>/sources/{result.slug}</code>
              </div>

              <div>
                <label style={LABEL}>Snippet de formulario de registro (HTML base)</label>
                <SnippetBlock code={result.formSnippet} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '4px' }}>
                <button onClick={onClose} style={BTN_PRIMARY}>Listo</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
  channels:     ChannelWithMetrics[]
  windowDays:   number
  isSuperAdmin: boolean
  tenants:      Array<{ id: string; name: string }>
}

export function SourcesClient({ channels, windowDays, isSuperAdmin, tenants }: Props) {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const [activeTab,    setActiveTab]    = useState<ChannelType | 'all'>('all')
  const [openModal,    setOpenModal]    = useState<'lead_magnet' | 'event' | null>(null)

  function setWindow(days: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('window', String(days))
    router.push(`/sources?${params.toString()}`)
  }

  const filtered = activeTab === 'all'
    ? channels
    : channels.filter(c => c.channelType === activeTab)

  return (
    <div>
      <style>{`
        .detail-link:hover { border-color: var(--accent-gold) !important; color: var(--accent-gold) !important; }
      `}</style>
      {openModal === 'lead_magnet' && <LeadMagnetModal onClose={() => { setOpenModal(null); router.refresh() }} isSuperAdmin={isSuperAdmin} tenants={tenants} />}
      {openModal === 'event'       && <EventModal      onClose={() => { setOpenModal(null); router.refresh() }} isSuperAdmin={isSuperAdmin} tenants={tenants} />}

      {/* Create buttons */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <button
          onClick={() => setOpenModal('event')}
          style={{ ...BTN_GHOST, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}
        >
          <Plus size={13} />
          Agregar Evento
        </button>
        <button
          onClick={() => setOpenModal('lead_magnet')}
          style={{
            padding: '8px 14px', fontSize: '12px', fontWeight: 500,
            color: 'var(--bg-base)', background: 'var(--accent-gold)',
            border: 'none', borderRadius: '8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '6px',
          }}
        >
          <Plus size={13} />
          Agregar Lead Magnet
        </button>
      </div>

      {/* Window selector + tab row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--border-subtle)', flex: 1 }}>
          {TAB_FILTERS.map(t => (
            <button
              key={t.value}
              onClick={() => setActiveTab(t.value as ChannelType | 'all')}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: activeTab === t.value ? 500 : 400,
                color: activeTab === t.value ? 'var(--accent-gold)' : 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === t.value ? '2px solid var(--accent-gold)' : '2px solid transparent',
                cursor: 'pointer',
                marginBottom: '-1px',
                whiteSpace: 'nowrap',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Window pills */}
        <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-elevated)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border-subtle)' }}>
          {WINDOWS.map(w => (
            <button
              key={w.value}
              onClick={() => setWindow(w.value)}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: windowDays === w.value ? 500 : 400,
                color: windowDays === w.value ? 'var(--text-primary)' : 'var(--text-muted)',
                background: windowDays === w.value ? 'var(--bg-surface)' : 'transparent',
                border: windowDays === w.value ? '1px solid var(--border-subtle)' : '1px solid transparent',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: '14px' }}>
          No hay fuentes en esta categoría.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {filtered.map(ch => (
            <ChannelCard key={ch.id} ch={ch} />
          ))}
        </div>
      )}
    </div>
  )
}
