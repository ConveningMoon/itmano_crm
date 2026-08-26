'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, ExternalLink, Sparkles } from 'lucide-react'
import { hostedNewsletterUrl } from '@/lib/hosted-page'
import type { NewsletterSeries } from '@/lib/data/newsletters'
import type { EmailSequence } from '@/lib/data/email-sequences'
import { NewSeriesModal } from './new-series-modal'
import { GenerateModal } from './generate-modal'

// Lista de series de newsletter — el equivalente a la lista de fuentes en
// /sources, pero para este canal. "Nueva edición" navega a /newsletters/nueva
// (editor de una edición dentro de una serie); "Nueva serie" abre el modal de
// esta misma página; "Generar con IA" abre el modal de generación — mismo
// patrón de botón que abre un ModalShell.

interface AgentOption {
  id:   string
  name: string
}

interface Props {
  series:        NewsletterSeries[]
  sequences:     EmailSequence[]
  agents:        AgentOption[]
  tenantSlug:    string
  /** tenants.newsletter_source_domains — la allowlist que GenerateModal enseña
   *  antes de generar. Vacío = el botón se muestra igual, pero deshabilitado
   *  con su motivo (lo resuelve el propio modal, vía canGenerateWithAi). */
  sourceDomains: string[]
  /** Sólo super_admin edita la allowlist. Cambia lo que el modal ofrece cuando
   *  falta: ir a Ajustes, o a quién escribir. */
  canEditSources: boolean
  /** Llegó con `?generar=1` (banner de /newsletters/nueva): abre el modal. */
  openGenerate: boolean
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function SeriesList({
  series, sequences, agents, tenantSlug, sourceDomains, canEditSources, openGenerate,
}: Props) {
  const [showNewSeries, setShowNewSeries] = useState(false)
  // Estado INICIAL, no efecto: si el usuario cierra el modal no vuelve a
  // abrirse solo, y no hace falta reescribir la URL para conseguirlo.
  const [showGenerate, setShowGenerate]   = useState(openGenerate)

  return (
    <>
      <style>{`
        .nl-series-card { transition: border-color 0.2s, box-shadow 0.3s, transform 0.3s cubic-bezier(0.22,1,0.36,1); }
        .nl-series-card:hover { border-color: var(--border-hover) !important; box-shadow: var(--highlight-top), var(--shadow-md); transform: translateY(-3px); }
        .nl-public-link:hover { color: var(--accent-gold) !important; }
        @media (prefers-reduced-motion: reduce) { .nl-series-card { transition: none !important; } }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Newsletters
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {series.length} {series.length === 1 ? 'serie' : 'series'} · contenido editorial con captación de suscriptores
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <Link
            href="/newsletters/nueva"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', fontSize: '13px', fontWeight: 500,
              background: 'var(--accent-gold)', color: 'var(--bg-base)',
              borderRadius: '8px', border: 'none', textDecoration: 'none',
            }}
          >
            <Plus size={14} />
            Nueva edición
          </Link>
          <button
            onClick={() => setShowGenerate(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 500,
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            <Sparkles size={14} />
            Generar con IA
          </button>
          <button
            onClick={() => setShowNewSeries(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 500,
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            Nueva serie
          </button>
        </div>
      </div>

      {/* Series grid / empty state */}
      {series.length === 0 ? (
        <div style={{
          padding: '40px 24px', textAlign: 'center',
          border: '1px solid var(--border-subtle)', borderRadius: '12px',
          background: 'var(--bg-surface)',
        }}>
          <p style={{
            fontSize: '13px', color: 'var(--text-muted)', margin: '0 auto',
            maxWidth: '440px', lineHeight: 1.6,
          }}>
            Todavía no hay ninguna serie. Una serie agrupa las ediciones que comparten
            público y secuencia de seguimiento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {series.map(s => (
            <SeriesCard key={s.id} series={s} tenantSlug={tenantSlug} />
          ))}
        </div>
      )}

      <NewSeriesModal
        open={showNewSeries}
        onClose={() => setShowNewSeries(false)}
        sequences={sequences}
        agents={agents}
      />

      <GenerateModal
        open={showGenerate}
        onClose={() => setShowGenerate(false)}
        series={series}
        sourceDomains={sourceDomains}
        canEditSources={canEditSources}
      />
    </>
  )
}

function SeriesCard({ series, tenantSlug }: { series: NewsletterSeries; tenantSlug: string }) {
  // URL ABSOLUTA de news.itmano.com, no la ruta interna /nl/…: este enlace se
  // comparte, y app.itmano.com/nl/… no es la dirección pública de la serie.
  // Mismo criterio que property-page-options.tsx con hostedPropertiesUrl.
  const publicUrl = tenantSlug ? hostedNewsletterUrl(tenantSlug, series.slug) : null

  return (
    <div
      className="nl-series-card"
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {series.name}
        </span>
        <span style={{
          fontSize: '10px', fontWeight: 500,
          color: series.active ? 'var(--accent-green)' : 'var(--text-muted)',
          background: series.active ? 'rgba(107,163,104,0.12)' : 'var(--bg-overlay)',
          padding: '2px 8px', borderRadius: '10px',
          letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
        }}>
          {series.active ? 'Activa' : 'Inactiva'}
        </span>
      </div>

      <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        {series.emailSequenceName ? `Secuencia: ${series.emailSequenceName}` : 'Sin secuencia vinculada'}
      </div>

      <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        <span>{series.subscriberCount} {series.subscriberCount === 1 ? 'suscriptor' : 'suscriptores'}</span>
        <span>{series.editionCount} {series.editionCount === 1 ? 'edición' : 'ediciones'}</span>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
        {series.lastEditionAt ? `Última edición: ${fmtDate(series.lastEditionAt)}` : 'Sin ediciones aún'}
      </div>

      {publicUrl && (
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="nl-public-link"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontSize: '12px', color: 'var(--text-secondary)', textDecoration: 'none', marginTop: '4px',
          }}
        >
          <ExternalLink size={12} />
          Ver página pública
        </a>
      )}
    </div>
  )
}
