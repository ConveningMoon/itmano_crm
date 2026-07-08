'use client'

import { useState, useTransition } from 'react'
import { Building2, Plus, ExternalLink, Pencil, Trash2, X, Upload, Globe, Sparkles } from 'lucide-react'
import type { Property, PropertyType, PropertyStatus } from '@/lib/data/properties'
import type { TenantRole } from '@/lib/auth/tenant-context'
import { createProperty, updateProperty, deleteProperty, uploadPropertyMedia } from './actions'
import type { PropertyInput } from './actions'
import { generatePropertyFromPdf } from './ai-actions'
import type { AiPropertyDraft } from './ai-actions'
import { FormSection } from '@/components/ui/form-section'

// Kebab-case slug from a free-text name (matches the server-side SLUG_RE).
function slugify(input: string): string {
  return input
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function splitLines(text: string): string[] {
  return text.split('\n').map(s => s.trim()).filter(Boolean)
}

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
  bedrooms: null, sqft: null,
  year_built: null, status: 'available',
  external_url: null, notes: null, tenant_id: undefined,
  // Web listing
  name: null, slug: null, neighborhood: null, state: null,
  bathrooms_full: null, bathrooms_half: null,
  garage_spaces: null, lot_sqft: null,
  description_en: null, description_es: null,
  features_en: [], features_es: [],
  image_url: null, gallery: [], floor_plans: [],
  detail_pdf_url: null, published_to_web: false,
}

function formFromProperty(p: Property): PropertyInput {
  return {
    address:       p.address,
    city:          p.city,
    mls_number:    p.mlsNumber,
    property_type: p.propertyType,
    list_price:    p.listPrice,
    bedrooms:      p.bedrooms,
    sqft:          p.sqft,
    year_built:    p.yearBuilt,
    status:        p.status,
    external_url:  p.externalUrl,
    notes:         p.notes,
    tenant_id:     p.tenantId,
    name:            p.name,
    slug:            p.slug,
    neighborhood:    p.neighborhood,
    state:           p.state,
    bathrooms_full:  p.bathroomsFull,
    bathrooms_half:  p.bathroomsHalf,
    garage_spaces:   p.garageSpaces,
    lot_sqft:        p.lotSqft,
    description_en:  p.descriptionEn,
    description_es:  p.descriptionEs,
    features_en:     p.featuresEn,
    features_es:     p.featuresEs,
    image_url:       p.imageUrl,
    gallery:         p.gallery,
    floor_plans:     p.floorPlans,
    detail_pdf_url:  p.detailPdfUrl,
    published_to_web: p.publishedToWeb,
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
  // Free-text mirrors of the features arrays (one item per line) for smooth typing.
  const [featuresEnText, setFeaturesEnText] = useState('')
  const [featuresEsText, setFeaturesEsText] = useState('')
  // Which media field is currently uploading ('image_url' | 'gallery' | ...).
  const [uploadingField, setUploadingField] = useState<string | null>(null)
  // Slug is auto-derived from name until the user edits it by hand.
  const [slugTouched, setSlugTouched] = useState(false)
  // Fields prefilled by "Crear con IA" — flagged for review until the user edits them.
  const [aiFields, setAiFields] = useState<Set<string>>(new Set())
  const [aiBusy, setAiBusy] = useState(false)
  const [isPending, startTransition] = useTransition()

  const filtered = tab === 'all' ? properties : properties.filter(p => p.status === tab)

  function openCreate() {
    setForm({ ...EMPTY_FORM, tenant_id: isSuperAdmin ? (tenants[0]?.id ?? undefined) : undefined })
    setFeaturesEnText('')
    setFeaturesEsText('')
    setSlugTouched(false)
    setAiFields(new Set())
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(prop: Property) {
    setForm(formFromProperty(prop))
    setFeaturesEnText(prop.featuresEn.join('\n'))
    setFeaturesEsText(prop.featuresEs.join('\n'))
    setSlugTouched(true) // an existing property keeps its slug
    setAiFields(new Set())
    setEditingId(prop.id)
    setFormError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setFormError(null)
    setUploadingField(null)
    setAiFields(new Set())
  }

  // Clear a field's AI-review flag once the user edits it by hand.
  function clearAiFlag(key: string) {
    setAiFields(prev => {
      if (!prev.has(key)) return prev
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }

  function setField<K extends keyof PropertyInput>(key: K, value: PropertyInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    clearAiFlag(key as string)
  }

  // Amber-highlight fields the AI prefilled (until edited); plain otherwise.
  function fieldStyle(key: string, select = false): React.CSSProperties {
    const base = select ? selectStyle : inputStyle
    return aiFields.has(key)
      ? { ...base, borderColor: 'var(--accent-gold)', boxShadow: '0 0 0 1px var(--accent-gold-dim)' }
      : base
  }

  // ── "Crear con IA": upload a listing PDF and open the form prefilled ─────────
  function triggerAiCreate(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setAiBusy(true)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('file', file)
      if (isSuperAdmin && tenants[0]?.id) fd.set('tenant_id', tenants[0].id)
      const res = await generatePropertyFromPdf(fd)
      setAiBusy(false)
      if (!res.ok) {
        // Surface the failure in the modal so the user can retry or fill manually.
        openCreate()
        setFormError(res.error)
        return
      }
      applyAiDraft(res.draft, res.fields)
    })
  }

  function applyAiDraft(draft: AiPropertyDraft, fields: Array<keyof AiPropertyDraft>) {
    const { features_en, features_es, ...scalar } = draft
    setForm({
      ...EMPTY_FORM,
      ...scalar,
      features_en,
      features_es,
      tenant_id: isSuperAdmin ? (tenants[0]?.id ?? undefined) : undefined,
      published_to_web: false, // never auto-publish AI drafts
    })
    setFeaturesEnText(features_en.join('\n'))
    setFeaturesEsText(features_es.join('\n'))
    setSlugTouched(true) // AI filled the slug; don't clobber it from the name
    setAiFields(new Set(fields as string[]))
    setEditingId(null)
    setFormError(null)
    setShowForm(true)
  }

  // Name → slug auto-fill (only while the slug hasn't been hand-edited).
  function onNameChange(value: string) {
    setForm(prev => ({
      ...prev,
      name: value || null,
      slug: slugTouched ? prev.slug : (slugify(value) || null),
    }))
    clearAiFlag('name')
  }

  async function uploadFiles(
    files: FileList | null,
    kind: 'image' | 'pdf',
    target: 'image_url' | 'detail_pdf_url' | 'gallery' | 'floor_plans',
  ) {
    if (!files || files.length === 0) return
    setUploadingField(target)
    setFormError(null)
    try {
      const urls: string[] = []
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.set('file', file)
        fd.set('kind', kind)
        if (form.tenant_id) fd.set('tenant_id', form.tenant_id)
        const res = await uploadPropertyMedia(fd)
        if (!res.ok) { setFormError(res.error); break }
        urls.push(res.url)
      }
      if (urls.length === 0) return
      if (target === 'image_url')          setField('image_url', urls[0])
      else if (target === 'detail_pdf_url') setField('detail_pdf_url', urls[0])
      else if (target === 'gallery')        setForm(prev => ({ ...prev, gallery: [...(prev.gallery ?? []), ...urls] }))
      else if (target === 'floor_plans')    setForm(prev => ({ ...prev, floor_plans: [...(prev.floor_plans ?? []), ...urls] }))
    } finally {
      setUploadingField(null)
    }
  }

  function removeFromArray(target: 'gallery' | 'floor_plans', url: string) {
    setForm(prev => ({ ...prev, [target]: (prev[target] ?? []).filter(u => u !== url) }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const payload: PropertyInput = {
      ...form,
      features_en: splitLines(featuresEnText),
      features_es: splitLines(featuresEsText),
    }
    startTransition(async () => {
      const result = editingId
        ? await updateProperty(editingId, payload)
        : await createProperty(payload)
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Crear con IA — upload a listing PDF, prefill the form */}
          <label
            title="Sube el PDF del listado y la IA prellena el formulario"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', fontSize: '13px', fontWeight: 500,
              background: 'var(--bg-surface)', color: 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)', borderRadius: '8px',
              cursor: aiBusy ? 'default' : 'pointer', opacity: aiBusy ? 0.7 : 1,
            }}
          >
            <Sparkles size={14} color="var(--accent-gold)" />
            {aiBusy ? 'Procesando PDF…' : 'Crear con IA'}
            <input
              type="file"
              accept="application/pdf"
              disabled={aiBusy}
              onChange={e => { triggerAiCreate(e.target.files); e.target.value = '' }}
              style={{ display: 'none' }}
            />
          </label>
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
              {aiFields.size > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'flex-start', gap: '8px',
                  fontSize: '12px', color: 'var(--text-secondary)',
                  background: 'rgba(201,169,110,0.1)', border: '1px solid var(--accent-gold-dim)',
                  borderRadius: '8px', padding: '10px 12px',
                }}>
                  <Sparkles size={14} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: '1px' }} />
                  <span>
                    Prellenado con IA desde el PDF. Los campos resaltados en dorado son sugerencias —
                    revísalos y corrige antes de guardar. La publicación en web queda desactivada hasta que confirmes.
                  </span>
                </div>
              )}
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
                  style={fieldStyle('address')}
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
                    style={fieldStyle('city')}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>MLS #</span>
                  <input
                    type="text"
                    value={form.mls_number ?? ''}
                    onChange={e => setField('mls_number', e.target.value || null)}
                    placeholder="10234567"
                    style={fieldStyle('mls_number')}
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
                    style={fieldStyle('property_type', true)}
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
                    style={fieldStyle('list_price')}
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
                    style={fieldStyle('year_built')}
                  />
                </label>
              </div>

              {/* Bedrooms + Bathrooms (full / half) */}
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
                    style={fieldStyle('bedrooms')}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Baños completos</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={form.bathrooms_full ?? ''}
                    onChange={e => setField('bathrooms_full', e.target.value ? Number(e.target.value) : null)}
                    placeholder="2"
                    style={fieldStyle('bathrooms_full')}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Medios baños</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={1}
                    value={form.bathrooms_half ?? ''}
                    onChange={e => setField('bathrooms_half', e.target.value ? Number(e.target.value) : null)}
                    placeholder="1"
                    style={fieldStyle('bathrooms_half')}
                  />
                </label>
              </div>

              {/* Sqft + Lot + Garage */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Sqft (interior)</span>
                  <input
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    value={form.sqft ?? ''}
                    onChange={e => setField('sqft', e.target.value ? Number(e.target.value) : null)}
                    placeholder="1800"
                    style={fieldStyle('sqft')}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Lote (sqft)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={form.lot_sqft ?? ''}
                    onChange={e => setField('lot_sqft', e.target.value ? Number(e.target.value) : null)}
                    placeholder="6000"
                    style={fieldStyle('lot_sqft')}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Garaje (autos)</span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    step={1}
                    value={form.garage_spaces ?? ''}
                    onChange={e => setField('garage_spaces', e.target.value ? Number(e.target.value) : null)}
                    placeholder="2"
                    style={fieldStyle('garage_spaces')}
                  />
                </label>
              </div>
              </FormSection>

              <FormSection title="Contenido web" description="Se muestra en el sitio público. Obligatorio solo si publicas la propiedad.">
              {/* Name + slug */}
              <label style={labelStyle}>
                <span style={labelTextStyle}>Nombre de la propiedad</span>
                <input
                  type="text"
                  value={form.name ?? ''}
                  onChange={e => onNameChange(e.target.value)}
                  placeholder="Oakmont Manor"
                  style={fieldStyle('name')}
                />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Slug (URL: /houses/&lt;slug&gt;)</span>
                <input
                  type="text"
                  value={form.slug ?? ''}
                  onChange={e => { setSlugTouched(true); setField('slug', e.target.value || null) }}
                  placeholder="oakmont-manor"
                  style={fieldStyle('slug')}
                />
              </label>

              {/* Neighborhood + State */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Vecindario</span>
                  <input
                    type="text"
                    value={form.neighborhood ?? ''}
                    onChange={e => setField('neighborhood', e.target.value || null)}
                    placeholder="Norfolk, Ghent"
                    style={fieldStyle('neighborhood')}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Estado</span>
                  <input
                    type="text"
                    value={form.state ?? ''}
                    onChange={e => setField('state', e.target.value || null)}
                    placeholder="VA"
                    style={fieldStyle('state')}
                  />
                </label>
              </div>

              {/* Descriptions EN / ES */}
              <label style={labelStyle}>
                <span style={labelTextStyle}>Descripción (inglés)</span>
                <textarea
                  value={form.description_en ?? ''}
                  onChange={e => setField('description_en', e.target.value || null)}
                  rows={4}
                  placeholder="Welcome to…"
                  style={{ ...fieldStyle('description_en'), resize: 'vertical', minHeight: '88px' }}
                />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Descripción (español)</span>
                <textarea
                  value={form.description_es ?? ''}
                  onChange={e => setField('description_es', e.target.value || null)}
                  rows={4}
                  placeholder="Bienvenido a…"
                  style={{ ...fieldStyle('description_es'), resize: 'vertical', minHeight: '88px' }}
                />
              </label>

              {/* Features EN / ES — one per line */}
              <label style={labelStyle}>
                <span style={labelTextStyle}>Características (inglés) — una por línea</span>
                <textarea
                  value={featuresEnText}
                  onChange={e => { setFeaturesEnText(e.target.value); clearAiFlag('features_en') }}
                  rows={4}
                  placeholder={'Updated kitchen\nTwo-car garage\nHardwood floors'}
                  style={{ ...fieldStyle('features_en'), resize: 'vertical', minHeight: '88px' }}
                />
              </label>
              <label style={labelStyle}>
                <span style={labelTextStyle}>Características (español) — una por línea</span>
                <textarea
                  value={featuresEsText}
                  onChange={e => { setFeaturesEsText(e.target.value); clearAiFlag('features_es') }}
                  rows={4}
                  placeholder={'Cocina renovada\nGaraje para dos autos\nPisos de madera'}
                  style={{ ...fieldStyle('features_es'), resize: 'vertical', minHeight: '88px' }}
                />
              </label>
              </FormSection>

              <FormSection title="Multimedia" description="Se sube a Storage del CRM. Formatos: JPG, PNG, WebP, GIF, AVIF (máx 10 MB) y PDF.">
              {/* Cover image */}
              <div style={labelStyle}>
                <span style={labelTextStyle}>Imagen de portada</span>
                {form.image_url && (
                  <div style={mediaRowStyle}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={form.image_url} alt="Portada" style={thumbStyle} />
                    <a href={form.image_url} target="_blank" rel="noopener noreferrer" style={mediaLinkStyle}>Ver</a>
                    <button type="button" onClick={() => setField('image_url', null)} style={mediaRemoveStyle}>
                      <X size={13} />
                    </button>
                  </div>
                )}
                <UploadButton
                  label={form.image_url ? 'Reemplazar portada' : 'Subir portada'}
                  busy={uploadingField === 'image_url'}
                  accept="image/*"
                  onFiles={files => uploadFiles(files, 'image', 'image_url')}
                />
              </div>

              {/* Gallery */}
              <div style={labelStyle}>
                <span style={labelTextStyle}>Galería</span>
                {(form.gallery ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {(form.gallery ?? []).map(url => (
                      <div key={url} style={{ position: 'relative' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" style={thumbStyle} />
                        <button type="button" onClick={() => removeFromArray('gallery', url)} style={thumbRemoveStyle}>
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <UploadButton
                  label="Agregar imágenes"
                  busy={uploadingField === 'gallery'}
                  accept="image/*"
                  multiple
                  onFiles={files => uploadFiles(files, 'image', 'gallery')}
                />
              </div>

              {/* Floor plans */}
              <div style={labelStyle}>
                <span style={labelTextStyle}>Planos</span>
                {(form.floor_plans ?? []).length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {(form.floor_plans ?? []).map(url => (
                      <div key={url} style={{ position: 'relative' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" style={thumbStyle} />
                        <button type="button" onClick={() => removeFromArray('floor_plans', url)} style={thumbRemoveStyle}>
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <UploadButton
                  label="Agregar planos"
                  busy={uploadingField === 'floor_plans'}
                  accept="image/*"
                  multiple
                  onFiles={files => uploadFiles(files, 'image', 'floor_plans')}
                />
              </div>

              {/* Detail PDF */}
              <div style={labelStyle}>
                <span style={labelTextStyle}>PDF de detalles</span>
                {form.detail_pdf_url && (
                  <div style={mediaRowStyle}>
                    <a href={form.detail_pdf_url} target="_blank" rel="noopener noreferrer" style={mediaLinkStyle}>
                      Ver PDF
                    </a>
                    <button type="button" onClick={() => setField('detail_pdf_url', null)} style={mediaRemoveStyle}>
                      <X size={13} />
                    </button>
                  </div>
                )}
                <UploadButton
                  label={form.detail_pdf_url ? 'Reemplazar PDF' : 'Subir PDF'}
                  busy={uploadingField === 'detail_pdf_url'}
                  accept="application/pdf"
                  onFiles={files => uploadFiles(files, 'pdf', 'detail_pdf_url')}
                />
              </div>
              </FormSection>

              <FormSection title="Publicación">
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={form.published_to_web ?? false}
                  onChange={e => setField('published_to_web', e.target.checked)}
                  style={{ marginTop: '2px', width: '16px', height: '16px', accentColor: 'var(--accent-gold)', cursor: 'pointer' }}
                />
                <span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    <Globe size={13} /> Publicar en la web
                  </span>
                  <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    Al activarlo, la propiedad aparece en el sitio público. Requiere nombre, slug,
                    vecindario, estado, ambas descripciones y una imagen de portada.
                  </span>
                </span>
              </label>
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

// ─── Upload button ─────────────────────────────────────────────────────────────
// A styled file picker that delegates the selected files to the parent's upload
// handler. Resets its input value so re-selecting the same file still fires.

interface UploadButtonProps {
  label:    string
  busy:     boolean
  accept:   string
  multiple?: boolean
  onFiles:  (files: FileList | null) => void
}

function UploadButton({ label, busy, accept, multiple = false, onFiles }: UploadButtonProps) {
  return (
    <label
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px', alignSelf: 'flex-start',
        padding: '7px 14px', fontSize: '12px', fontWeight: 500,
        background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
        border: '1px solid var(--border-subtle)', borderRadius: '8px',
        cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
      }}
    >
      <Upload size={13} />
      {busy ? 'Subiendo…' : label}
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={busy}
        onChange={e => { onFiles(e.target.files); e.target.value = '' }}
        style={{ display: 'none' }}
      />
    </label>
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

const thumbStyle: React.CSSProperties = {
  width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px',
  border: '1px solid var(--border-subtle)', display: 'block',
}
const thumbRemoveStyle: React.CSSProperties = {
  position: 'absolute', top: '-6px', right: '-6px',
  width: '18px', height: '18px', borderRadius: '50%', border: 'none', cursor: 'pointer',
  background: 'var(--accent-coral)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
}
const mediaRowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '10px',
}
const mediaLinkStyle: React.CSSProperties = {
  fontSize: '12px', color: 'var(--accent-blue)', textDecoration: 'none',
}
const mediaRemoveStyle: React.CSSProperties = {
  padding: '4px', borderRadius: '6px', border: 'none', cursor: 'pointer',
  background: 'var(--bg-elevated)', color: 'var(--accent-coral)',
  display: 'flex', alignItems: 'center',
}
