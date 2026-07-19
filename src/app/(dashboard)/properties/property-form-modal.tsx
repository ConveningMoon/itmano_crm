'use client'

import { useState, useTransition } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { X, Upload, Globe, Sparkles, Trash2 } from 'lucide-react'
import type { Property, PropertyType, PropertyStatus } from '@/lib/data/properties'
import { createProperty, updateProperty, deleteProperty, deletePropertyMediaByUrls, deletePropertyFolder } from './actions'
import type { PropertyInput } from './actions'
import type { AiPropertyDraft } from './ai-actions'
import { FormSection } from '@/components/ui/form-section'
import { Switch } from '@/components/ui/switch'
import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'

// Modal de crear/editar propiedad — extraído de properties-client para poder
// abrirlo también desde la página de detalle (/properties/[id]) sin volver a
// la lista. El caller lo monta condicionalmente; el estado se inicializa una
// sola vez desde props (editing | aiInit | vacío).

export const TYPE_LABELS: Record<PropertyType, string> = {
  residential: 'Residencial',
  condo:       'Condominio',
  townhouse:   'Townhouse',
  land:        'Terreno',
  commercial:  'Comercial',
  multifamily: 'Multifamiliar',
}

export const STATUS_CONFIG: Record<PropertyStatus, { label: string; color: string; bg: string }> = {
  available: { label: 'Disponible',        color: 'var(--accent-green)', bg: 'rgba(107,163,104,0.12)' },
  in_process: { label: 'En proceso',       color: 'var(--accent-gold)',  bg: 'rgba(201,169,110,0.12)' },
  sold:       { label: 'Vendida',          color: 'var(--accent-blue)',  bg: 'rgba(91,142,201,0.12)'  },
}

// Kebab-case slug from a free-text name (matches the server-side SLUG_RE).
function slugify(input: string): string {
  return input
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

function splitLines(text: string): string[] {
  return text.split('\n').map(s => s.trim()).filter(Boolean)
}

// All media URLs referenced by a form — used to reconcile Storage on save/discard.
function mediaUrlsOf(f: PropertyInput): string[] {
  return [f.image_url, f.detail_pdf_url, ...(f.gallery ?? []), ...(f.floor_plans ?? [])]
    .filter((u): u is string => typeof u === 'string' && u.length > 0)
}

// Per-list caps (kept in sync with the Zod schema in actions.ts).
const MAX_GALLERY = 60
const MAX_FLOOR_PLANS = 30

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
  content_languages: ['en'], descriptions: {}, features_i18n: {},
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
    content_languages: p.contentLanguages.length ? p.contentLanguages.slice(0, 3) : (Object.keys(p.descriptions).length ? Object.keys(p.descriptions).slice(0, 3) : ['en']),
    descriptions:      p.descriptions,
    features_i18n:     p.featuresI18n,
    image_url:       p.imageUrl,
    gallery:         p.gallery,
    floor_plans:     p.floorPlans,
    detail_pdf_url:  p.detailPdfUrl,
    published_to_web: p.publishedToWeb,
  }
}

export interface AiInit {
  draft:  AiPropertyDraft
  fields: string[]
}

interface Props {
  editing:       Property | null
  aiInit?:       AiInit | null
  initialError?: string | null
  tenants:       Array<{ id: string; name: string }>
  isSuperAdmin:  boolean
  allowDelete:   boolean
  /** Slugs de otras propiedades ya guardadas (decide la purga de carpeta al descartar un alta). */
  existingSlugs: string[]
  onClose:       () => void
  onDeleted?:    () => void
}

export function PropertyFormModal({
  editing, aiInit, initialError, tenants, isSuperAdmin, allowDelete, existingSlugs, onClose, onDeleted,
}: Props) {
  const editingId = editing?.id ?? null

  const [form, setForm] = useState<PropertyInput>(() => {
    if (editing) return formFromProperty(editing)
    if (aiInit) {
      const { descriptions, features_i18n, content_languages, ...scalar } = aiInit.draft
      return {
        ...EMPTY_FORM,
        ...scalar,
        content_languages: content_languages.length ? content_languages : ['es', 'en'],
        descriptions,
        features_i18n,
        tenant_id: isSuperAdmin ? (tenants[0]?.id ?? undefined) : undefined,
        published_to_web: false, // never auto-publish AI drafts
      }
    }
    return { ...EMPTY_FORM, tenant_id: isSuperAdmin ? (tenants[0]?.id ?? undefined) : undefined }
  })
  // Free-text mirrors of the features arrays (one item per line) for smooth typing.
  const [featuresText, setFeaturesText] = useState<Record<string, string>>(() => {
    const src = editing?.featuresI18n ?? aiInit?.draft.features_i18n ?? {}
    return Object.fromEntries(Object.entries(src).map(([l, arr]) => [l, (arr ?? []).join('\n')]))
  })
  const [formError, setFormError] = useState<string | null>(initialError ?? null)
  // Media model: files upload to Storage immediately on selection and their URL
  // goes straight into the form. Storage is reconciled at save/discard so files
  // that were removed (or uploaded then abandoned) don't linger.
  const [uploadingField, setUploadingField] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [sessionUrls, setSessionUrls] = useState<string[]>(() =>
    // El PDF de la IA ya está en Storage — se limpia si el borrador se descarta.
    aiInit?.draft.detail_pdf_url ? [aiInit.draft.detail_pdf_url] : [])
  const [initialUrls] = useState<string[]>(() => editing ? mediaUrlsOf(formFromProperty(editing)) : [])
  const [galleryNames, setGalleryNames] = useState<Set<string>>(new Set())
  const [floorNames, setFloorNames] = useState<Set<string>>(new Set())
  // Slug is auto-derived from name until the user edits it by hand.
  const [slugTouched, setSlugTouched] = useState(() => !!editing || !!aiInit)
  // Fields prefilled by "Crear con IA" — flagged for review until the user edits them.
  const [aiFields, setAiFields] = useState<Set<string>>(() => new Set(aiInit?.fields ?? []))
  // Unsaved-changes tracking → confirm before an accidental outside-click close.
  const [dirty, setDirty] = useState(() => !!aiInit) // an unsaved AI draft counts as unsaved changes
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Fire-and-forget Storage cleanup; never blocks the UI.
  function fireDeleteMedia(urls: string[], tenantId?: string) {
    if (urls.length === 0) return
    void deletePropertyMediaByUrls(urls, tenantId ?? form.tenant_id)
  }

  // Discard: nothing was persisted, so this session's uploads must be removed
  // from Storage. For a brand-new property whose slug isn't already taken by an
  // existing property, its folder holds ONLY this session's uploads → purge the
  // whole folder. Otherwise only this session's tracked uploads are removed.
  function discardAndClose() {
    const isNew = editingId === null
    const slug = (form.slug ?? '').trim()
    const tenantId = form.tenant_id
    const urls = [...sessionUrls]
    const slugTakenByExisting = existingSlugs.includes(slug)

    onClose()

    if (isNew && slug && !slugTakenByExisting) {
      void deletePropertyFolder(slug, tenantId)
    } else {
      fireDeleteMedia(urls, tenantId)
    }
  }

  // Outside-click on the modal: confirm if there are unsaved changes, else close.
  function requestClose() {
    if (dirty) setConfirmingClose(true)
    else onClose()
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
    setDirty(true)
  }

  // Amber-highlight fields the AI prefilled (until edited); plain otherwise.
  function fieldStyle(key: string, select = false): React.CSSProperties {
    const base = select ? selectStyle : inputStyle
    return aiFields.has(key)
      ? { ...base, borderColor: 'var(--accent-gold)', boxShadow: '0 0 0 1px var(--accent-gold-dim)' }
      : base
  }

  // Name → slug auto-fill (only while the slug hasn't been hand-edited).
  function onNameChange(value: string) {
    setForm(prev => ({
      ...prev,
      name: value || null,
      slug: slugTouched ? prev.slug : (slugify(value) || null),
    }))
    clearAiFlag('name')
    setDirty(true)
  }

  // Uploads one file to Storage immediately and returns its result. This is a
  // plain fetch to a Route Handler, not a Server Action call: Server Actions
  // POST to the page route itself, which src/proxy.ts (the auth middleware)
  // intercepts — and passing a binary File through that layer corrupted the
  // upload. /api/* is excluded from the proxy matcher, so the route handler
  // receives the raw multipart body untouched.
  async function uploadOne(
    file: File,
    kind: 'image' | 'pdf',
  ): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    const fd = new FormData()
    fd.set('file', file)
    fd.set('kind', kind)
    if (form.tenant_id) fd.set('tenant_id', form.tenant_id)
    // Media is stored per-property under a folder named by the slug.
    fd.set('slug', form.slug ?? '')
    const res = await fetch('/api/properties/media', { method: 'POST', body: fd })
    try {
      return await res.json()
    } catch {
      return { ok: false, error: 'No se pudo subir el archivo. Verifica tu conexión e intenta de nuevo.' }
    }
  }

  // Uploads the selected files right away and stores their URLs on the form.
  // Gallery/floor lists enforce a per-list cap and a same-name dedup guard.
  async function uploadFiles(
    files: FileList | null,
    kind: 'image' | 'pdf',
    target: 'image_url' | 'detail_pdf_url' | 'gallery' | 'floor_plans',
  ) {
    if (!files || files.length === 0) return
    if (!(form.slug ?? '').trim()) {
      setFormError('Agrega el nombre de la propiedad antes de subir archivos.')
      return
    }
    setFormError(null)
    const arr = Array.from(files)

    // ── Single slots: cover / PDF ──────────────────────────────────────────────
    if (target === 'image_url' || target === 'detail_pdf_url') {
      setUploadingField(target)
      try {
        const r = await uploadOne(arr[0], kind)
        if (!r.ok) { setFormError(r.error); return }
        // The previous value (session upload or saved URL) is reconciled on save.
        setField(target, r.url)
        setSessionUrls(prev => [...prev, r.url])
      } catch (err) {
        console.error('[properties] upload threw', err)
        setFormError('No se pudo subir el archivo. Verifica tu conexión e intenta de nuevo.')
      } finally {
        setUploadingField(null)
      }
      return
    }

    // ── Lists: gallery / floor_plans ───────────────────────────────────────────
    const max = target === 'gallery' ? MAX_GALLERY : MAX_FLOOR_PLANS
    const namesState = target === 'gallery' ? galleryNames : floorNames
    const seen = new Set(namesState)
    const unique: File[] = []
    const dups: string[] = []
    for (const f of arr) {
      if (seen.has(f.name)) { dups.push(f.name); continue }
      seen.add(f.name)
      unique.push(f)
    }
    const room = Math.max(0, max - (form[target] ?? []).length)
    const toUpload = unique.slice(0, room)

    const notes: string[] = []
    if (dups.length > 0) {
      notes.push(dups.length === 1
        ? `"${dups[0]}" ya está en la lista; no se agregó de nuevo.`
        : `${dups.length} imágenes repetidas se omitieron.`)
    }
    if (toUpload.length < unique.length) {
      notes.push(`Máximo ${max} ${target === 'gallery' ? 'imágenes' : 'planos'}.`)
    }
    if (notes.length > 0) setFormError(notes.join(' '))
    if (toUpload.length === 0) return

    setUploadingField(target)
    setUploadProgress({ done: 0, total: toUpload.length })
    try {
      let done = 0
      const results = await Promise.all(toUpload.map(async f => {
        const r = await uploadOne(f, 'image')
        done += 1
        setUploadProgress({ done, total: toUpload.length })
        return r
      }))

      const urls: string[] = []
      const okNames: string[] = []
      let firstErr: string | null = null
      results.forEach((r, i) => {
        if (r.ok) { urls.push(r.url); okNames.push(toUpload[i].name) }
        else if (!firstErr) firstErr = r.error
      })
      if (firstErr) setFormError(firstErr)
      if (urls.length === 0) return

      const setNames = target === 'gallery' ? setGalleryNames : setFloorNames
      setNames(prev => { const n = new Set(prev); okNames.forEach(x => n.add(x)); return n })
      setForm(prev => ({ ...prev, [target]: [...(prev[target] ?? []), ...urls] }))
      setSessionUrls(prev => [...prev, ...urls])
      setDirty(true)
    } catch (err) {
      console.error('[properties] batch upload threw', err)
      setFormError('No se pudieron subir los archivos. Verifica tu conexión e intenta de nuevo.')
    } finally {
      setUploadingField(null)
      setUploadProgress(null)
    }
  }

  // If `url` was uploaded during THIS session (never persisted), delete it from
  // Storage the moment it's removed from the form — no orphan left behind if the
  // user later abandons the form. Previously-saved images are left untouched
  // (save-reconcile handles them) so cancelling an edit keeps them intact.
  function dropSessionUpload(url: string | null | undefined) {
    if (!url) return
    if (sessionUrls.includes(url) && !initialUrls.includes(url)) {
      setSessionUrls(prev => prev.filter(u => u !== url))
      fireDeleteMedia([url])
    }
  }

  function removeCover() { dropSessionUpload(form.image_url); setField('image_url', null) }
  function removePdf() { dropSessionUpload(form.detail_pdf_url); setField('detail_pdf_url', null) }

  // Remove a stored gallery/floor-plan URL from the form. Session uploads are
  // deleted from Storage immediately; saved images are reconciled on save.
  function removeFromArray(target: 'gallery' | 'floor_plans', url: string) {
    dropSessionUpload(url)
    setForm(prev => ({ ...prev, [target]: (prev[target] ?? []).filter(u => u !== url) }))
    setDirty(true)
  }

  function submitForm() {
    setFormError(null)
    startTransition(async () => {
      // Características por idioma desde el texto libre (solo idiomas elegidos).
      const langs = form.content_languages ?? []
      const features_i18n: Record<string, string[]> = {}
      for (const l of langs) {
        const lines = splitLines(featuresText[l] ?? '')
        if (lines.length) features_i18n[l] = lines
      }
      const payload: PropertyInput = {
        ...form,
        content_languages: langs,
        features_i18n,
      }
      try {
        const result = editingId
          ? await updateProperty(editingId, payload)
          : await createProperty(payload)
        if (!result.ok) {
          setFormError(result.error)
          setConfirmingClose(false) // return to the form so the error is visible
          return
        }
        // Reconcile Storage: delete files that were saved before or uploaded
        // this session but are no longer referenced by the saved property.
        const finalUrls = mediaUrlsOf(payload)
        const orphans = [...new Set([...initialUrls, ...sessionUrls])].filter(u => !finalUrls.includes(u))
        fireDeleteMedia(orphans)
        onClose()
      } catch (err) {
        unstable_rethrow(err)
        console.error('[properties] save threw', err)
        const detail = err instanceof Error && err.message ? ` (${err.message})` : ''
        setFormError(`No se pudo guardar la propiedad. Intenta de nuevo.${detail}`)
        setConfirmingClose(false)
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    submitForm()
  }

  function handleDelete() {
    if (!editingId) return
    setConfirmingDelete(false)
    startTransition(async () => {
      await deleteProperty(editingId)
      onDeleted?.()
      onClose()
    })
  }

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px',
        }}
        onClick={e => { if (e.target === e.currentTarget) requestClose() }}
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
              onClick={discardAndClose}
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
                  step="any"
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
                  step="any"
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

            {/* Idiomas del contenido (máx 3) + descripción y características por idioma */}
            <div style={labelStyle}>
              <span style={labelTextStyle}>Idiomas de la descripción (máx 3)</span>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                {SUPPORTED_LANGUAGE_CODES.map(l => {
                  const on = (form.content_languages ?? []).includes(l)
                  const atMax = (form.content_languages ?? []).length >= 3
                  return (
                    <button
                      key={l}
                      type="button"
                      disabled={!on && atMax}
                      onClick={() => {
                        const cur = form.content_languages ?? []
                        const next = on ? cur.filter(x => x !== l) : [...cur, l]
                        setField('content_languages', next)
                      }}
                      style={{
                        padding: '5px 10px', fontSize: '12px', fontWeight: 500, cursor: (!on && atMax) ? 'default' : 'pointer', borderRadius: '999px',
                        background: on ? 'rgba(201,169,110,0.15)' : 'transparent',
                        border: `1px solid ${on ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                        color: on ? 'var(--accent-gold)' : 'var(--text-muted)',
                        opacity: (!on && atMax) ? 0.4 : 1,
                      }}
                    >
                      {LANGUAGE_CONFIG[l].flag} {LANGUAGE_CONFIG[l].label}
                    </button>
                  )
                })}
              </div>
            </div>

            {(form.content_languages ?? []).map(l => (
              <div key={l} style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'var(--bg-elevated)' }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-gold)', letterSpacing: '0.04em' }}>
                  {LANGUAGE_CONFIG[l as keyof typeof LANGUAGE_CONFIG]?.flag} {LANGUAGE_CONFIG[l as keyof typeof LANGUAGE_CONFIG]?.label ?? l}
                </div>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Descripción</span>
                  <textarea
                    value={form.descriptions?.[l] ?? ''}
                    onChange={e => { setField('descriptions', { ...(form.descriptions ?? {}), [l]: e.target.value }); clearAiFlag('descriptions') }}
                    rows={4}
                    placeholder="Bienvenido a…"
                    style={{ ...fieldStyle('descriptions'), resize: 'vertical', minHeight: '88px' }}
                  />
                </label>
                <label style={labelStyle}>
                  <span style={labelTextStyle}>Características — una por línea</span>
                  <textarea
                    value={featuresText[l] ?? ''}
                    onChange={e => { setFeaturesText(prev => ({ ...prev, [l]: e.target.value })); clearAiFlag('features_i18n'); setDirty(true) }}
                    rows={4}
                    placeholder={'Cocina renovada\nGaraje para dos autos\nPisos de madera'}
                    style={{ ...fieldStyle('features_i18n'), resize: 'vertical', minHeight: '88px' }}
                  />
                </label>
              </div>
            ))}
            </FormSection>

            <FormSection title="Multimedia" description="Cada archivo se sube al seleccionarlo. Acepta JPG, PNG, WebP, GIF, AVIF, BMP, TIFF (máx 10 MB) y PDF — las imágenes se optimizan y convierten a WebP automáticamente.">
            {/* Cover image */}
            <div style={labelStyle}>
              <span style={labelTextStyle}>Imagen de portada</span>
              {form.image_url && (
                <div style={mediaRowStyle}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.image_url} alt="Portada" style={thumbStyle} />
                  <a href={form.image_url} target="_blank" rel="noopener noreferrer" style={mediaLinkStyle}>Ver</a>
                  <button type="button" onClick={removeCover} style={mediaRemoveStyle}>
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
                progress={uploadingField === 'gallery' ? uploadProgress : null}
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
                progress={uploadingField === 'floor_plans' ? uploadProgress : null}
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
                  <button type="button" onClick={removePdf} style={mediaRemoveStyle}>
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
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <Switch
                checked={form.published_to_web ?? false}
                onChange={next => setField('published_to_web', next)}
                aria-label="Publicar en la web"
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
              {editingId && allowDelete && (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  style={{
                    marginRight: 'auto', display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', fontSize: '13px', fontWeight: 500,
                    background: 'transparent', color: 'var(--accent-coral)',
                    borderRadius: '8px', border: '1px solid rgba(201,123,107,0.3)', cursor: 'pointer',
                  }}
                >
                  <Trash2 size={13} /> Eliminar
                </button>
              )}
              <button
                type="button"
                onClick={discardAndClose}
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

      {/* ── Unsaved-changes confirmation (accidental outside-click) ───────────── */}
      {confirmingClose && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmingClose(false) }}
        >
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            padding: '28px',
            width: '100%',
            maxWidth: '420px',
          }}>
            <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
              Tienes cambios sin guardar
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              ¿Quieres guardar los cambios de esta propiedad antes de cerrar?
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button
                onClick={() => setConfirmingClose(false)}
                style={{
                  padding: '8px 16px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: 'pointer',
                }}
              >
                Seguir editando
              </button>
              <button
                onClick={discardAndClose}
                style={{
                  padding: '8px 16px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--bg-elevated)', color: 'var(--accent-coral)',
                  borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: 'pointer',
                }}
              >
                Descartar
              </button>
              <button
                onClick={submitForm}
                disabled={isPending}
                style={{
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--accent-gold)', color: 'var(--bg-base)',
                  borderRadius: '8px', border: 'none', cursor: isPending ? 'default' : 'pointer',
                  opacity: isPending ? 0.7 : 1,
                }}
              >
                {isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirmation ──────────────────────────────────────────────── */}
      {confirmingDelete && editing && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 60,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '16px',
          }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmingDelete(false) }}
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
              ¿Eliminar <strong style={{ color: 'var(--text-primary)' }}>{editing.address}</strong>? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmingDelete(false)}
                style={{
                  padding: '8px 16px', fontSize: '13px', fontWeight: 500,
                  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
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
  progress?: { done: number; total: number } | null
  accept:   string
  multiple?: boolean
  onFiles:  (files: FileList | null) => void
}

function UploadButton({ label, busy, progress, accept, multiple = false, onFiles }: UploadButtonProps) {
  const busyLabel = progress && progress.total > 0
    ? `Subiendo ${progress.done}/${progress.total} (${Math.round((progress.done / progress.total) * 100)}%)`
    : 'Subiendo…'
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
      {busy ? busyLabel : label}
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
