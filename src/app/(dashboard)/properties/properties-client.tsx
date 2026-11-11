'use client'

import Image from 'next/image'
import Link from 'next/link'

import { useState } from 'react'
import { Building2, Plus, ExternalLink, Globe, Sparkles } from 'lucide-react'
import type { Property, PropertyStatus } from '@/lib/data/properties'
import type { TenantRole } from '@/lib/auth/tenant-context'
import { generatePropertyFromPdf } from './ai-actions'
import { PropertyFormModal, type AiInit } from './property-form-modal'
import { TYPE_LABELS, STATUS_CONFIG } from './property-labels'
import { AiCreateModal } from './ai-create-modal'

// Lista de propiedades: pestañas por estado y tarjetas que abren el detalle. El formulario de
// crear/editar vive en property-form-modal.tsx (compartido con el detalle).

type FilterTab = 'all' | PropertyStatus

const TABS: Array<{ value: FilterTab; label: string }> = [
  { value: 'all',        label: 'Todas'      },
  { value: 'available',  label: 'Disponibles' },
  { value: 'in_process', label: 'En proceso'  },
  { value: 'sold',       label: 'Vendidas'    },
]

interface Props {
  properties: Property[]
  tenants:    Array<{ id: string; name: string }>
  viewerRole: TenantRole
}

function fmtPrice(n: number | null): string {
  if (n === null) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

// "Crear con IA" is built but gated off until the Claude API is provisioned
// (ANTHROPIC_API_KEY + billing). Flip to true to re-enable. See CLAUDE.md.
const AI_ENABLED = true

type ModalState = { aiInit?: AiInit | null; error?: string | null }

export function PropertiesClient({ properties, tenants, viewerRole }: Props) {
  const isSuperAdmin = viewerRole === 'super_admin'

  const [tab, setTab]     = useState<FilterTab>('all')
  const [modal, setModal] = useState<ModalState | null>(null)
  const [modalKey, setModalKey] = useState(0)
  const [showAiModal, setShowAiModal] = useState(false)

  const filtered = tab === 'all' ? properties : properties.filter(p => p.status === tab)
  const existingSlugs = properties.map(p => p.slug).filter((s): s is string => !!s)

  function openModal(state: ModalState) {
    setModalKey(k => k + 1)
    setModal(state)
  }

  // ── "Crear con IA": el modal recoge PDF + idiomas y llama aquí. Corremos la
  //    extracción y, si funciona, abrimos el formulario prellenado. ────────────
  async function runAiGenerate(file: File, langs: string[]): Promise<{ ok: boolean; error?: string }> {
    const fd = new FormData()
    fd.set('file', file)
    fd.set('languages', (langs.length ? langs : ['es', 'en']).join(','))
    if (isSuperAdmin && tenants[0]?.id) fd.set('tenant_id', tenants[0].id)
    const res = await generatePropertyFromPdf(fd)
    if (!res.ok) return { ok: false, error: res.error }
    openModal({ aiInit: { draft: res.draft, fields: res.fields }, error: res.warning ?? null })
    return { ok: true }
  }

  const countFor = (t: FilterTab) => t === 'all' ? properties.length : properties.filter(p => p.status === t).length

  return (
    <>
      <div className="toolbar">
        <div className="filter-tabs filter-tabs-fit" role="tablist" aria-label="Estado de la propiedad">
          {TABS.map(t => (
            <button
              key={t.value}
              type="button"
              role="tab"
              className="filter-tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
            >
              {t.label}
              <span className="filter-tab-count">{countFor(t.value)}</span>
            </button>
          ))}
        </div>
        <div className="toolbar-group">
          {/* Crear con IA — abre el popup (PDF + idiomas). */}
          {AI_ENABLED && (
            <button
              type="button"
              onClick={() => setShowAiModal(true)}
              title="Sube el PDF del listado y la IA prellena el formulario"
              className="btn btn-ghost"
            >
              <Sparkles size={14} className="text-gold" aria-hidden="true" />
              Crear con IA
            </button>
          )}
          <button type="button" onClick={() => openModal({})} className="btn btn-primary btn-cta">
            <Plus size={14} aria-hidden="true" />
            Nueva propiedad
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-card">
          <span className="empty-card-icon" aria-hidden="true"><Building2 size={18} /></span>
          {tab === 'all'
            ? 'Todavía no hay propiedades en el inventario.'
            : `No hay propiedades con estado "${STATUS_CONFIG[tab as PropertyStatus]?.label ?? tab}".`}
          {tab === 'all' && (
            <button type="button" onClick={() => openModal({})} className="btn btn-primary">
              <Plus size={13} aria-hidden="true" />
              Agregar propiedad
            </button>
          )}
        </div>
      ) : (
        <div className="prop-grid">
          {filtered.map((prop, i) => (
            <PropertyCard
              key={prop.id}
              prop={prop}
              showTenant={isSuperAdmin}
              delayMs={Math.min(i * 45, 360)}
            />
          ))}
        </div>
      )}

      {/* ── Popup "Crear con IA" (PDF + idiomas) ─────────────────────────────── */}
      {showAiModal && (
        <AiCreateModal
          onClose={() => setShowAiModal(false)}
          onGenerate={runAiGenerate}
        />
      )}

      {/* ── Create modal (manual o con borrador de IA) ───────────────────────── */}
      {modal && (
        <PropertyFormModal
          key={modalKey}
          editing={null}
          aiInit={modal.aiInit ?? null}
          initialError={modal.error ?? null}
          tenants={tenants}
          isSuperAdmin={isSuperAdmin}
          allowDelete={false}
          existingSlugs={existingSlugs}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

// Tarjeta de la lista. El título es el enlace al detalle y su ::after cubre la
// tarjeta entera (clic en cualquier parte); el enlace externo queda por encima.
function PropertyCard({ prop, showTenant, delayMs }: { prop: Property; showTenant: boolean; delayMs: number }) {
  const status = STATUS_CONFIG[prop.status]
  const specs = [
    prop.bedrooms  !== null ? `${prop.bedrooms} hab.` : null,
    prop.bathrooms !== null ? `${prop.bathrooms} baños` : null,
    prop.sqft      !== null ? `${prop.sqft.toLocaleString('en-US')} sqft` : null,
    prop.yearBuilt !== null ? String(prop.yearBuilt) : null,
  ].filter((s): s is string => !!s)

  return (
    <article className="prop-card" style={{ animationDelay: `${delayMs}ms` }}>
      <div className="prop-cover">
        {prop.imageUrl ? (
          // La portada mide 160 px de alto en una tarjeta de ~300 px de
          // ancho: `sizes` es lo que hace que se baje esa variante y no
          // la foto original de varios cientos de kB.
          <Image
            src={prop.imageUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 340px"
            className="prop-cover-img"
          />
        ) : (
          <Building2 size={28} strokeWidth={1.2} aria-hidden="true" />
        )}
      </div>

      <div className="prop-card-body">
        <div className="prop-card-top">
          <div className="prop-who">
            <Link href={`/properties/${prop.id}`} className="prop-title">
              {prop.address}
            </Link>
            {prop.city && <div className="prop-sub">{prop.city}</div>}
          </div>
          <span className="pill" style={{ '--tone': status.color } as React.CSSProperties}>
            {status.label}
          </span>
        </div>

        <div className="prop-tags">
          <span className="pill pill-xs pill-square" data-tone="mute">{TYPE_LABELS[prop.propertyType]}</span>
          {prop.publishedToWeb && (
            <span className="pill pill-xs pill-square" style={{ '--tone': 'var(--gold-2)' } as React.CSSProperties}>
              <Globe size={10} aria-hidden="true" /> Web
            </span>
          )}
          {prop.mlsNumber && <span>MLS #{prop.mlsNumber}</span>}
          {showTenant && prop.tenantName && <span className="text-gold">{prop.tenantName}</span>}
        </div>

        {prop.listPrice !== null && <div className="prop-price">{fmtPrice(prop.listPrice)}</div>}

        {specs.length > 0 && (
          <div className="prop-specs">
            {specs.map(s => <span key={s}>{s}</span>)}
          </div>
        )}

        <div className="prop-foot">
          <span>
            {(prop.createdByAgentName || prop.createdByUserId) && <>Agregada por {prop.createdByAgentName ?? 'Propietario'}</>}
          </span>
          {prop.externalUrl && (
            <a href={prop.externalUrl} target="_blank" rel="noopener noreferrer" className="prop-link">
              <ExternalLink size={11} aria-hidden="true" />
              Ver listado
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
