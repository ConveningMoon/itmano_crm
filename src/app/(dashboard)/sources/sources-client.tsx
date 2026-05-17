'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import type { ChannelWithMetrics, ChannelType } from '@/lib/data/channels'

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
          }}
        >
          Ver detalle
        </Link>
      </div>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

interface Props {
  channels: ChannelWithMetrics[]
  windowDays: number
}

export function SourcesClient({ channels, windowDays }: Props) {
  const router      = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<ChannelType | 'all'>('all')

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
