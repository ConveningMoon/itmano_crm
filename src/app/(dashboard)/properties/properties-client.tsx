'use client'

import { useState, useTransition } from 'react'
import { Building2, Plus, ExternalLink, Pencil, Trash2, X } from 'lucide-react'
import type { Property, PropertyType, PropertyStatus } from '@/lib/data/properties'
import type { TenantRole } from '@/lib/auth/tenant-context'
import { createProperty, updateProperty, deleteProperty } from './actions'
import type { PropertyInput } from './actions'
import { FormSection } from '@/components/ui/form-section'

// ─── Config ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<PropertyType, string> = {
  residential: 'Residencial',
  condo:       'Condominio',
  townhouse:   'Townhouse',
  land:        'Terreno',
  commercial:  'Comercial',
  multifamily: 'Multifamiliar',
}

const STATUS_CONFIG: Record<PropertyStatus, { label: string; color: string; bg: string }> = {
  available: { label: 'Disponible',        color: 'var(--accent-green)', bg: 'rgba(107,163,104,0.12)' },
  in_process: { label: 'En proceso',       color: 'var(--accent-gold)',  bg: 'rgba(201,169,110,0.12)' },
  sold:       { label: 'Vendida',          color: 'var(--accent-blue)',  bg: 'rgba(91,142,201,0.12)'  },
}

type FilterTab = 'all' | PropertyStatus

const TABS: Array<{ value: FilterTab; label: string }> = [
  { value: 'all',        label: 'Todas'      },
  { value: 'available',  label: 'Disponibles' },
  { value: 'in_process', label: 'En proceso'  },
  { value: 'sold',       label: 'Vendidas'    },
]

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  properties:   Property[]
  tenants:      Array<{ id: string; name: string }>
  viewerRole:   TenantRole
  viewerUserId: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function canWrite(prop: Property, role: TenantRole, userId: string): boolean {
  if (role === 'super_admin' || role === 'agent_owner') return true
  return prop.createdByUserId === userId
}

function fmtPrice(n: number | null): string {
  if (n === null) return ''
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

// ─── Form state ───────────────────────────────────────────────────────────────

const EMPTY_FORM: PropertyInput = {
  address: '', city: null, mls_number: null,
  property_type: 'residential', list_price: null,
  bedrooms: null, bathrooms: null, sqft: null,
  year_built: null, status: 'available',
  external_url: null, notes: null, tenant_id: undefined,
}

function formFromProperty(p: Property): PropertyInput {
  return {
    address:       p.address,
    city:          p.city,
    mls_number:    p.mlsNumber,
    property_type: p.propertyType,
    list_price:    p.listPrice,
    bedrooms:      p.bedrooms,
    bathrooms:     p.bathrooms,
    sqft:          p.sqft,
    year_built:    p.yearBuilt,
    status:        p.status,
    external_url:  p.externalUrl,
    notes:         p.notes,
    tenant_id:     p.tenantId,
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PropertiesClient({ properties, tenants, viewerRole, viewerUserId }: Props) {
  const isSuperAdmin = viewerRole === 'super_admin'

  const [tab, setTab]               = useState<FilterTab>('all')
  const [showForm, setShowForm]     = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [formError, setFormError]   = useState<string | null>(null)
  const [form, setForm]             = useState<PropertyInput>(EMPTY_FORM)
  const [isPending, startTransition] = useTransition()

  const filtered = tab === 'all' ? properties : properties.filter(p => p.status === tab)

  function openCreate() {
    setForm({ ...EMPTY_FORM, tenant_id: isSuperAdmin ? (tenants[0]?.id ?? undefined) : undefined })
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(prop: Property) {
    setForm(formFromProperty(prop))
    setEditingId(prop.id)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
  }

  function setField<K extends keyof PropertyInput>(key: K, value: PropertyInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const result = editingId
        ? await updateProperty(editingId, form)
        : await createProperty(form)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      closeForm()
    })
  }

  function handleDelete(id: string) {
    setDeletingId(null)
    startTransition(async () => {
      await deleteProperty(id)
    })
  }

  const deletingProp = properties.find(p => p.id === deletingId)

  return (
    <>
      <style>{`
        .prop-card { transition: border-color var(--dur-fast), box-shadow var(--dur-fast); }
        .prop-card:hover { border-color: var(--border-hover) !important; box-shadow: var(--highlight-top), var(--shadow-md); }
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
        <button
          onClick={openCreate}
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
              onClick={openCreate}
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
          {filtered.map(prop => {
            const status = STATUS_CONFIG[prop.status]
            const editable = canWrite(prop, viewerRole, viewerUserId)
            return (
              <div
                key={prop.id}
                className="prop-card"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
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

                {/* Footer: external link + actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                  <div>
                    {prop.externalUrl && (
                      <a
                        href={prop.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
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
                  {editable && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button
                        onClick={() => openEdit(prop)}
                        title="Editar"
                        style={{
                          padding: '5px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                          background: 'var(--bg-elevated)', color: 'var(--text-muted)',
                          display: 'flex', alignItems: 'center',
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeletingId(prop.id)}
                        title="Eliminar"
                        style={{
                          padding: '5px', borderRadius: '6px', border: 'none', cursor: 'pointer',
                          background: 'var(--bg-elevated)', color: 'var(--accent-coral)',
                          display: 'flex', alignItems: 'center',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Create / Edit modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) closeForm() }}
        >
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '28px',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            {/* Modal header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
                {editingId ? 'Editar propiedad' : 'Nueva propiedad'}
              </h2>
              <button
                onClick={closeForm}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-muted)', padding: '4px',
                  display: 'flex', alignItems: 'center',
                }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <FormSection title="Básico" first>
              {/* Tenant selector — super_admin only */}
              {isSuperAdmin && !editingId && tenants.length > 0 && (
                <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Tenant *
                  </span>
                  <select
                    value={form.tenant_id ?? ''}
                    onChange={e => setField('tenant_id', e.target.value || undefined)}
                    required
                    style={selectStyle}
                  >
                    <option value="">Selecciona un tenant…</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </label>
              )}

              {/* Address */}
              <label style={labelStyle}>
                <span style={labelTextStyle}>Dirección *</span>
                <input
                  type="text"
                  value={form.address}
                  onChange={e => setField('address', e.target.value)}
                  placeholder="123 Main St"
                  required
                  style={inputStyle}
                />
              </label>

              {/* City + MLS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Ciudad</span>
                  <input
                    type="text"
                    value={form.city ?? ''}
                    onChange={e => setField('city', e.target.value || null)}
                    placeholder="Virginia Beach"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>MLS #</span>
                  <input
                    type="text"
                    value={form.mls_number ?? ''}
                    onChange={e => setField('mls_number', e.target.value || null)}
                    placeholder="10234567"
                    style={inputStyle}
                  />
                </label>
              </div>

              {/* Type + Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Tipo *</span>
                  <select
                    value={form.property_type}
                    onChange={e => setField('property_type', e.target.value as PropertyType)}
                    required
                    style={selectStyle}
                  >
                    {Object.entries(TYPE_LABELS).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Estado</span>
                  <select
                    value={form.status}
                    onChange={e => setField('status', e.target.value as PropertyStatus)}
                    style={selectStyle}
                  >
                    {Object.entries(STATUS_CONFIG).map(([v, s]) => (
                      <option key={v} value={v}>{s.label}</option>
                    ))}
                  </select>
                </label>
              </div>
              </FormSection>

              <FormSection title="Precio y especificaciones">
              {/* Price + Year */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Precio de lista ($)</span>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={form.list_price ?? ''}
                    onChange={e => setField('list_price', e.target.value ? Number(e.target.value) : null)}
                    placeholder="350000"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Año de construcción</span>
                  <input
                    type="number"
                    min={1800}
                    max={2100}
                    value={form.year_built ?? ''}
                    onChange={e => setField('year_built', e.target.value ? Number(e.target.value) : null)}
                    placeholder="2005"
                    style={inputStyle}
                  />
                </label>
              </div>

              {/* Bedrooms + Bathrooms + Sqft */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Habitaciones</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={form.bedrooms ?? ''}
                    onChange={e => setField('bedrooms', e.target.value ? Number(e.target.value) : null)}
                    placeholder="3"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Baños</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={0.5}
                    value={form.bathrooms ?? ''}
                    onChange={e => setField('bathrooms', e.target.value ? Number(e.target.value) : null)}
                    placeholder="2.5"
                    style={inputStyle}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Sqft</span>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    step={1}
                    value={form.sqft ?? ''}
                    onChange={e => setField('sqft', e.target.value ? Number(e.target.value) : null)}
                    placeholder="1800"
                    style={inputStyle}
                  />
                </label>
              </div>
              </FormSection>

              <FormSection title="Enlaces y notas">
              {/* External URL */}
              <label style={labelStyle}>
                <span style={labelTextStyle}>Enlace externo (MLS / Zillow / etc.)</span>
                <input
                  type="url"
                  value={form.external_url ?? ''}
                  onChange={e => setField('external_url', e.target.value || null)}
                  placeholder="https://…"
                  style={inputStyle}
                />
              </label>

              {/* Notes */}
              <label style={labelStyle}>
                <span style={labelTextStyle}>Notas internas</span>
                <textarea
                  value={form.notes ?? ''}
                  onChange={e => setField('notes', e.target.value || null)}
                  rows={3}
                  placeholder="Observaciones para el equipo…"
                  style={{ ...inputStyle, resize: 'vertical', minHeight: '72px' }}
                />
              </label>
              </FormSection>

              {/* Error */}
              {formError && (
                <div style={{
                  fontSize: '12px', color: 'var(--accent-coral)',
                  background: 'rgba(201,123,107,0.1)', borderRadius: '6px', padding: '8px 12px',
                }}>
                  {formError}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={closeForm}
                  style={{
                    padding: '8px 16px', fontSize: '13px', fontWeight: 500,
                    background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                    borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: 'pointer',
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  style={{
                    padding: '8px 20px', fontSize: '13px', fontWeight: 500,
                    background: 'var(--accent-gold)', color: 'var(--bg-base)',
                    borderRadius: '8px', border: 'none', cursor: isPending ? 'default' : 'pointer',
                    opacity: isPending ? 0.7 : 1,
                  }}
                >
                  {isPending ? 'Guardando…' : editingId ? 'Guardar cambios' : 'Agregar propiedad'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      {deletingId && deletingProp && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setDeletingId(null) }}
        >
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '28px',
            width: '100%',
            maxWidth: '400px',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Eliminar propiedad
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              ¿Eliminar <strong style={{ color: 'var(--text-primary)' }}>{deletingProp.address}</strong>? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeletingId(null)}
                style={{
                  padding: '8px 16px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deletingId)}
                disabled={isPending}
                style={{
                  padding: '8px 16px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--accent-coral)', color: '#fff',
                  borderRadius: '8px', border: 'none', cursor: isPending ? 'default' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── Shared style tokens ──────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '6px' }
const labelTextStyle: React.CSSProperties = {
  fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)',
  textTransform: 'uppercase', letterSpacing: '0.06em',
}
const inputStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '8px 12px', fontSize: '13px',
  color: 'var(--text-primary)', width: '100%', boxSizing: 'border-box',
  outline: 'none',
}
const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
