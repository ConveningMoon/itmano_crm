'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Plus, ExternalLink, Globe, Sparkles } from 'lucide-react'
import type { Property, PropertyStatus } from '@/lib/data/properties'
import type { TenantRole } from '@/lib/auth/tenant-context'
import { generatePropertyFromPdf } from './ai-actions'
import { PropertyFormModal, TYPE_LABELS, STATUS_CONFIG, type AiInit } from './property-form-modal'
import { AiCreateModal } from './ai-create-modal'

// Lista de propiedades: tarjetas clickeables → detalle. El formulario de
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
  const router       = useRouter()

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

  return (
    <>
      <style>{`
        @keyframes prop-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
        .prop-card { animation: prop-rise 0.45s cubic-bezier(0.22,1,0.36,1) both; transition: border-color 0.2s, box-shadow 0.3s, transform 0.3s cubic-bezier(0.22,1,0.36,1); }
        .prop-card:hover { border-color: var(--border-hover) !important; box-shadow: var(--highlight-top), var(--shadow-md); transform: translateY(-3px); }
        .prop-card:hover .prop-cover { transform: scale(1.04); }
        .prop-cover { transition: transform 0.5s cubic-bezier(0.22,1,0.36,1); }
        @media (prefers-reduced-motion: reduce) { .prop-card, .prop-cover { animation: none !important; transition: none !important; } }
        .tab-btn { transition: background var(--dur-fast), color var(--dur-fast); }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
            Propiedades
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            {properties.length} {properties.length === 1 ? 'propiedad' : 'propiedades'} en el inventario
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Crear con IA — abre el popup (PDF + idiomas). */}
          {AI_ENABLED && (
            <button
              onClick={() => setShowAiModal(true)}
              title="Sube el PDF del listado y la IA prellena el formulario"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', fontSize: '13px', fontWeight: 500,
                background: 'var(--bg-surface)', color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)', borderRadius: '8px', cursor: 'pointer',
              }}
            >
              <Sparkles size={14} color="var(--accent-gold)" />
              Crear con IA
            </button>
          )}
          <button
            onClick={() => openModal({})}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', fontSize: '13px', fontWeight: 500,
              background: 'var(--accent-gold)', color: 'var(--bg-base)',
              borderRadius: '8px', border: 'none', cursor: 'pointer',
            }}
          >
            <Plus size={14} />
            Nueva propiedad
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.value}
            className="tab-btn"
            onClick={() => setTab(t.value)}
            style={{
              padding: '6px 14px', fontSize: '12px', fontWeight: 500,
              borderRadius: '8px', border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              background: tab === t.value ? 'var(--accent-gold)' : 'var(--bg-surface)',
              color:      tab === t.value ? 'var(--bg-base)'     : 'var(--text-secondary)',
            }}
          >
            {t.label}
            {t.value !== 'all' && (
              <span style={{ marginLeft: '6px', opacity: 0.7 }}>
                ({properties.filter(p => p.status === t.value).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{
          background: 'var(--bg-surface)', border: '1px dashed rgba(255,255,255,0.1)',
          borderRadius: '12px', padding: '64px 48px', textAlign: 'center',
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'rgba(201,169,110,0.1)', margin: '0 auto 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Building2 size={18} color="var(--accent-gold)" />
          </div>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
            Sin propiedades
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '360px', margin: '0 auto 20px' }}>
            {tab === 'all'
              ? 'Agrega la primera propiedad del inventario de la agencia.'
              : `No hay propiedades con estado "${STATUS_CONFIG[tab as PropertyStatus]?.label ?? tab}".`}
          </div>
          {tab === 'all' && (
            <button
              onClick={() => openModal({})}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '9px 18px', fontSize: '13px', fontWeight: 500,
                background: 'var(--accent-gold)', color: 'var(--bg-base)',
                borderRadius: '8px', border: 'none', cursor: 'pointer',
              }}
            >
              <Plus size={13} />
              Agregar propiedad
            </button>
          )}
        </div>
      )}

      {/* Property grid */}
      {filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filtered.map((prop, i) => {
            const status = STATUS_CONFIG[prop.status]
            return (
              <div
                key={prop.id}
                className="prop-card"
                role="link"
                tabIndex={0}
                onClick={() => router.push(`/properties/${prop.id}`)}
                onKeyDown={e => { if (e.key === 'Enter') router.push(`/properties/${prop.id}`) }}
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  cursor: 'pointer',
                  overflow: 'hidden',
                  animationDelay: `${Math.min(i * 45, 360)}ms`,
                }}
              >
                {/* Cover preview — bleeds over the card padding to the rounded top edge */}
                {prop.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="prop-cover"
                    src={prop.imageUrl}
                    alt={`Portada de ${prop.address}`}
                    loading="lazy"
                    style={{
                      margin: '-20px -20px 0',
                      width: 'calc(100% + 40px)',
                      height: '160px',
                      objectFit: 'cover',
                      borderRadius: '11px 11px 0 0',
                      borderBottom: '1px solid var(--border-subtle)',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      margin: '-20px -20px 0',
                      width: 'calc(100% + 40px)',
                      height: '160px',
                      borderRadius: '11px 11px 0 0',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: 'var(--bg-elevated)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <Building2 size={28} strokeWidth={1.2} />
                  </div>
                )}

                {/* Top: address + status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {prop.address}
                    </div>
                    {prop.city && (
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {prop.city}
                      </div>
                    )}
                  </div>
                  <span style={{
                    flexShrink: 0, fontSize: '10px', fontWeight: 500, padding: '2px 8px',
                    borderRadius: '10px', letterSpacing: '0.06em', textTransform: 'uppercase',
                    color: status.color, background: status.bg,
                  }}>
                    {status.label}
                  </span>
                </div>

                {/* Badges: type + MLS */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '4px',
                    background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                    letterSpacing: '0.04em',
                  }}>
                    {TYPE_LABELS[prop.propertyType]}
                  </span>
                  {prop.mlsNumber && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      MLS #{prop.mlsNumber}
                    </span>
                  )}
                  {prop.publishedToWeb && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                      fontSize: '10px', fontWeight: 500, padding: '2px 7px', borderRadius: '4px',
                      background: 'rgba(107,163,104,0.12)', color: 'var(--accent-green)',
                      letterSpacing: '0.04em',
                    }}>
                      <Globe size={10} /> Web
                    </span>
                  )}
                </div>

                {/* Price */}
                {prop.listPrice !== null && (
                  <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--accent-gold)', letterSpacing: '-0.02em' }}>
                    {fmtPrice(prop.listPrice)}
                  </div>
                )}

                {/* Details row */}
                {(prop.bedrooms !== null || prop.bathrooms !== null || prop.sqft !== null) && (
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {prop.bedrooms   !== null && <span>{prop.bedrooms} hab.</span>}
                    {prop.bathrooms  !== null && <span>{prop.bathrooms} baños</span>}
                    {prop.sqft       !== null && <span>{prop.sqft.toLocaleString()} sqft</span>}
                    {prop.yearBuilt  !== null && <span>{prop.yearBuilt}</span>}
                  </div>
                )}

                {/* Author + tenant */}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {(prop.createdByAgentName || prop.createdByUserId) && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Agregada por {prop.createdByAgentName ?? 'Propietario'}
                    </span>
                  )}
                  {isSuperAdmin && prop.tenantName && (
                    <span style={{
                      fontSize: '10px', padding: '1px 6px', borderRadius: '4px',
                      background: 'rgba(201,169,110,0.1)', color: 'var(--accent-gold)',
                    }}>
                      {prop.tenantName}
                    </span>
                  )}
                </div>

                {/* Footer: external link + abrir detalle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <div>
                    {prop.externalUrl && (
                      <a
                        href={prop.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          fontSize: '11px', color: 'var(--accent-blue)', textDecoration: 'none',
                        }}
                      >
                        <ExternalLink size={11} />
                        Ver listado
                      </a>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Abrir detalle →</span>
                </div>
              </div>
            )
          })}
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
