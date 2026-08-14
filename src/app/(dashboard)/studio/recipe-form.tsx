'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, Sparkles, Eye } from 'lucide-react'
import { STYLES } from '@/lib/studio/styles'
import { createStudioImage, previewStudioImage } from './actions'
import { TemplatePicker } from './template-picker'
import { Lightbox } from './lightbox'
import { templatesForRecipe } from '@/lib/studio/templates/registry'
import { Field, TextInput, TextArea, Select, Toggle } from './field-inputs'
import { PalettePicker } from './palette-picker'
import { DEFAULT_PALETTE, tenantPreset, type StudioPalette } from '@/lib/studio/palettes'
import type { AgentOption, PropertyOption } from '@/lib/data/studio'
import type { StudioImage } from '@/lib/studio/types'

// Formulario del generador. Una receta = un formulario distinto, no uno genérico
// con campos opcionales: los datos que pide cada pieza son los que acaban
// escritos en la imagen, y validarlos completos ANTES de generar es lo que evita
// imprecisiones y gasto de tokens.

const RECIPES = [
  { key: 'open_house',  label: 'Casa abierta' },
  { key: 'new_listing', label: 'Nueva disponible' },
  { key: 'sold',        label: 'Vendida' },
  { key: 'event',       label: 'Evento' },
  { key: 'open_prompt', label: 'Prompt abierto' },
]

const HOUSE_RECIPES = ['open_house', 'new_listing', 'sold']

const REFERENCE_ROLES = [
  { value: 'subject',     label: 'Es la casa',        hint: 'Se conserva la arquitectura; solo cambian luz, cielo y encuadre.' },
  { value: 'style',       label: 'Es el estilo',      hint: 'Se copian la paleta y el clima; el contenido se ignora.' },
  { value: 'composition', label: 'Es la composición', hint: 'Se conserva el encuadre; el contenido es nuevo.' },
]

const ASPECTS = [
  { value: '4:5',  label: '4:5 · feed alto' },
  { value: '1:1',  label: '1:1 · feed cuadrado' },
  { value: '9:16', label: '9:16 · story' },
]

const EVENT_TYPES = [
  { value: 'otro',                     label: 'Otro' },
  { value: 'seminario',                label: 'Seminario' },
  { value: 'webinar',                  label: 'Webinar' },
  { value: 'casa_abierta_comunitaria', label: 'Casa abierta comunitaria' },
]

type Fields = Record<string, unknown>

function num(v: string): number | undefined {
  const n = Number(v.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

export function RecipeForm({ properties, agents, tenantColor, onCreated }: {
  properties:  PropertyOption[]
  agents:      AgentOption[]
  /** tenants.primary_color — el preset "Marca del equipo". Dato, no código. */
  tenantColor: string
  onCreated:   (image: StudioImage) => void
}) {
  // Arranca en la única receta que ya tiene diseños; con las nueve dará igual.
  const [recipe, setRecipe] = useState('new_listing')
  const [fields, setFields] = useState<Fields>({})
  const [palette, setPalette] = useState<StudioPalette>(tenantColor ? tenantPreset(tenantColor).palette : DEFAULT_PALETTE)
  const [style, setStyle] = useState(STYLES[0].key)
  const [aspect, setAspect] = useState('4:5')
  const [sourceMode, setSourceMode] = useState('generate')
  const [sceneNotes, setSceneNotes] = useState('')
  const [propertyId, setPropertyId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [referenceRole, setReferenceRole] = useState('subject')
  const [template, setTemplate] = useState('')
  const [headline, setHeadline] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [zoomPreview, setZoomPreview] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isHouse = HOUSE_RECIPES.includes(recipe)
  const property = useMemo(() => properties.find(p => p.id === propertyId) ?? null, [properties, propertyId])
  const canUsePhoto = isHouse && !!property?.photos.length
  const templates = useMemo(() => templatesForRecipe(recipe as never), [recipe])
  const agent = agents.find(a => a.id === agentId)

  function set(key: string, value: unknown) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  // Autorrelleno al elegir propiedad. Se hace en el handler y no en un efecto
  // para no volver a pisar lo que el usuario ya editó a mano.
  function selectProperty(id: string) {
    setPropertyId(id)
    if (!id) { setSourceMode('generate'); return }
    const p = properties.find(x => x.id === id)
    if (!p) return
    setFields(prev => ({
      ...prev,
      address:   [p.address, p.city, p.state].filter(Boolean).join(', '),
      price:     p.list_price ?? undefined,
      bedrooms:  p.bedrooms ?? undefined,
      bathrooms: p.bathrooms ?? undefined,
      sqft:      p.sqft ?? undefined,
    }))
  }

  function changeRecipe(key: string) {
    setRecipe(key)
    setFields({})
    setPropertyId('')
    setSourceMode('generate')
    // Un diseño solo sirve para las recetas que declara: al cambiar de receta
    // deja de ser válido y el selector vuelve a estar sin elegir.
    setTemplate('')
    setPreview(null)
  }

  function buildPayload() {
    return {
      ...fields,
      recipe, style, aspect, palette,
      source_mode:    sourceMode,
      template:       template || undefined,
      headline:       headline || undefined,
      scene_notes:    sceneNotes || undefined,
      property_id:    propertyId || undefined,
      agent_id:       agentId || undefined,
      has_reference:  !!referenceFile,
      reference_role: referenceFile ? referenceRole : undefined,
    }
  }

  function formData(): FormData {
    const data = new FormData()
    data.set('payload', JSON.stringify(buildPayload()))
    if (referenceFile) data.set('reference', referenceFile)
    return data
  }

  // Previsualizar no persiste nada y con diseño no cuesta: el agente puede
  // saltar entre los tres hasta dar con el que quiere.
  function doPreview() {
    setError(null)
    startTransition(async () => {
      const r = await previewStudioImage(formData())
      if (r.ok) setPreview(r.data.dataUri)
      else setError(r.error)
    })
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await createStudioImage(formData())
      if (r.ok) { onCreated(r.data); setPreview(null) }
      else setError(r.error)
    })
  }

  return (
    <div>
      <style>{`
        .studio-recipe:hover { border-color: var(--accent-gold) !important; color: var(--text-primary) !important; }
        .studio-generate:hover:not(:disabled) { background: var(--accent-gold) !important; color: var(--bg-base) !important; }
      `}</style>

      {/* Receta */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '20px' }}>
        {RECIPES.map(r => {
          const active = r.key === recipe
          return (
            <button
              key={r.key}
              type="button"
              className={active ? undefined : 'studio-recipe'}
              onClick={() => changeRecipe(r.key)}
              style={{
                padding: '6px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer',
                background: active ? 'color-mix(in srgb, var(--accent-gold) 14%, transparent)' : 'transparent',
                border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
                transition: 'color var(--dur-fast), border-color var(--dur-fast)',
              }}
            >
              {r.label}
            </button>
          )
        })}
      </div>

      {/* Selector de propiedad */}
      {isHouse && properties.length > 0 && (
        <Field label="Propiedad" hint="Rellena los datos desde el CRM. Puedes editarlos o saltarte el selector.">
          <Select
            value={propertyId}
            onChange={e => selectProperty(e.target.value)}
            options={[
              { value: '', label: 'Escribir los datos a mano' },
              ...properties.map(p => ({ value: p.id, label: [p.address, p.city].filter(Boolean).join(', ') })),
            ]}
          />
        </Field>
      )}

      {canUsePhoto && (
        <Field label="Fondo" hint="Usar la foto real no consume generación y muestra la casa que el comprador va a ver.">
          <Select
            value={sourceMode}
            onChange={e => setSourceMode(e.target.value)}
            options={[
              { value: 'generate', label: 'Generar escena con IA' },
              { value: 'photo',    label: 'Usar la foto tal cual' },
            ]}
          />
        </Field>
      )}

      {/* Diseño: se elige mirando, no de una lista de nombres */}
      {isHouse && (
        <TemplatePicker
          templates={templates}
          value={template}
          onChange={setTemplate}
          photoCount={property?.photos.length ?? 0}
          hasAgentPhoto={!!agent?.cover_photo_url}
          showFit={!!propertyId}
        />
      )}

      {isHouse && (
        <Field label="Titular" hint="Opcional. Sin él se usa uno por defecto según la receta.">
          <TextInput
            value={headline}
            maxLength={60}
            onChange={e => setHeadline(e.target.value)}
            placeholder="Casa elegante y familiar en venta"
          />
        </Field>
      )}

      {/* Campos por receta */}
      {recipe === 'open_house' && (
        <>
          <Field label="Dirección">
            <TextInput value={String(fields.address ?? '')} onChange={e => set('address', e.target.value)} placeholder="123 Ocean View Ave, Norfolk, VA" />
          </Field>
          <Field label="Fecha">
            <TextInput type="date" value={String(fields.date ?? '')} onChange={e => set('date', e.target.value)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Hora de inicio">
              <TextInput type="time" value={String(fields.time_start ?? '')} onChange={e => set('time_start', e.target.value)} />
            </Field>
            <Field label="Hora de cierre">
              <TextInput type="time" value={String(fields.time_end ?? '')} onChange={e => set('time_end', e.target.value)} />
            </Field>
          </div>
          <Toggle checked={!!fields.refreshments} onChange={v => set('refreshments', v)} label="Con refrigerios" />
        </>
      )}

      {recipe === 'new_listing' && (
        <>
          <Field label="Dirección">
            <TextInput value={String(fields.address ?? '')} onChange={e => set('address', e.target.value)} placeholder="9 Bay Street, Virginia Beach, VA" />
          </Field>
          <Field label="Precio">
            <TextInput inputMode="numeric" value={fields.price === undefined ? '' : String(fields.price)} onChange={e => set('price', num(e.target.value))} placeholder="450000" />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <Field label="Habitaciones">
              <TextInput inputMode="numeric" value={fields.bedrooms === undefined ? '' : String(fields.bedrooms)} onChange={e => set('bedrooms', num(e.target.value))} />
            </Field>
            <Field label="Baños">
              <TextInput inputMode="numeric" value={fields.bathrooms === undefined ? '' : String(fields.bathrooms)} onChange={e => set('bathrooms', num(e.target.value))} />
            </Field>
            <Field label="Sqft">
              <TextInput inputMode="numeric" value={fields.sqft === undefined ? '' : String(fields.sqft)} onChange={e => set('sqft', num(e.target.value))} />
            </Field>
          </div>
          <Field label="Destacados" hint="Hasta tres, separados por coma.">
            <TextInput
              value={Array.isArray(fields.highlights) ? (fields.highlights as string[]).join(', ') : ''}
              onChange={e => set('highlights', e.target.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, 3))}
              placeholder="Piscina, Cocina nueva"
            />
          </Field>
        </>
      )}

      {recipe === 'sold' && (
        <>
          <Field label="Dirección o zona">
            <TextInput value={String(fields.address ?? '')} onChange={e => set('address', e.target.value)} placeholder="Ghent, Norfolk" />
          </Field>
          <Toggle checked={!!fields.show_price} onChange={v => set('show_price', v)} label="Mostrar la cifra" />
          {!!fields.show_price && (
            <Field label="Cifra">
              <TextInput inputMode="numeric" value={fields.price === undefined ? '' : String(fields.price)} onChange={e => set('price', num(e.target.value))} placeholder="389000" />
            </Field>
          )}
          <Field label="Nota">
            <TextInput value={String(fields.note ?? '')} onChange={e => set('note', e.target.value || undefined)} placeholder="Vendida en 9 días" />
          </Field>
        </>
      )}

      {recipe === 'event' && (
        <>
          <Field label="Título">
            <TextInput value={String(fields.title ?? '')} onChange={e => set('title', e.target.value)} placeholder="Seminario para compradores primerizos" />
          </Field>
          <Field label="Tipo">
            <Select value={String(fields.event_type ?? 'otro')} onChange={e => set('event_type', e.target.value)} options={EVENT_TYPES} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <Field label="Fecha">
              <TextInput type="date" value={String(fields.date ?? '')} onChange={e => set('date', e.target.value)} />
            </Field>
            <Field label="Hora">
              <TextInput type="time" value={String(fields.time_start ?? '')} onChange={e => set('time_start', e.target.value)} />
            </Field>
          </div>
          <Field label="Lugar">
            <TextInput value={String(fields.venue ?? '')} onChange={e => set('venue', e.target.value)} placeholder="Centro Comunitario Ghent" />
          </Field>
          <Toggle checked={fields.is_free !== false} onChange={v => set('is_free', v)} label="Entrada libre" />
          {fields.is_free === false && (
            <Field label="Cifra">
              <TextInput inputMode="numeric" value={fields.price === undefined ? '' : String(fields.price)} onChange={e => set('price', num(e.target.value))} placeholder="25" />
            </Field>
          )}
          <Field label="Cómo registrarse">
            <TextInput value={String(fields.signup ?? '')} onChange={e => set('signup', e.target.value || undefined)} placeholder="itmano.com/eventos" />
          </Field>
        </>
      )}

      {recipe === 'open_prompt' && (
        <Field label="Prompt">
          <TextArea value={String(fields.prompt ?? '')} onChange={e => set('prompt', e.target.value)} placeholder="Una llave dorada sobre mármol, luz lateral" />
        </Field>
      )}

      {/* Comunes */}
      {recipe !== 'open_prompt' && !template && (
        <Field label="¿Cómo es la casa? ¿Qué quieres que se vea?" hint="Opcional. Se suma como contexto de la escena; no cambia el diseño ni los datos.">
          <TextArea value={sceneNotes} onChange={e => setSceneNotes(e.target.value)} placeholder="colonial de ladrillo con porche, frente al agua…" />
        </Field>
      )}

      {agents.length > 0 && (
        <Field label="Agente">
          <Select
            value={agentId}
            onChange={e => setAgentId(e.target.value)}
            options={[{ value: '', label: 'Sin agente' }, ...agents.map(a => ({ value: a.id, label: a.name }))]}
          />
        </Field>
      )}

      {/* El estilo es dirección de arte PARA EL MODELO. Con un diseño elegido no
          hay escena que generar, así que no dirige nada y solo estorba. */}
      {!template && (
      <Field label="Estilo" hint={STYLES.find(s => s.key === style)?.hint}>
        <Select
          value={style}
          onChange={e => setStyle(e.target.value)}
          options={STYLES.map(s => ({ value: s.key, label: s.label }))}
        />
      </Field>
      )}

      <PalettePicker value={palette} onChange={setPalette} tenantColor={tenantColor} />

      {!template && (
      <Field label="Imagen de referencia">
        <input
          type="file"
          accept="image/*"
          onChange={e => setReferenceFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: '12px', color: 'var(--text-muted)' }}
        />
      </Field>
      )}

      {!template && referenceFile && (
        <Field label="¿Qué es esa imagen?" hint={REFERENCE_ROLES.find(r => r.value === referenceRole)?.hint}>
          <Select
            value={referenceRole}
            onChange={e => setReferenceRole(e.target.value)}
            options={REFERENCE_ROLES.map(r => ({ value: r.value, label: r.label }))}
          />
        </Field>
      )}

      <Field label="Formato">
        <Select value={aspect} onChange={e => setAspect(e.target.value)} options={ASPECTS} />
      </Field>

      {error && (
        <p style={{ fontSize: '12px', color: 'var(--status-lost, #c96b6b)', margin: '0 0 12px' }}>{error}</p>
      )}

      {template && (
        <button
          type="button"
          className="studio-generate"
          disabled={pending}
          onClick={doPreview}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            width: '100%', padding: '11px', fontSize: '13px', fontWeight: 500,
            borderRadius: '8px', cursor: pending ? 'default' : 'pointer', marginBottom: '10px',
            background: 'transparent', border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)', opacity: pending ? 0.6 : 1,
            transition: 'background-color var(--dur-fast), color var(--dur-fast)',
          }}
        >
          <Eye size={14} /> Previsualizar
        </button>
      )}

      {template && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
          Este diseño usa las fotos y los datos de la propiedad: no consume generación con IA.
          Previsualiza las veces que quieras.
        </p>
      )}
      {!template && isHouse && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
          Elige un diseño para componer la pieza sin costo.
        </p>
      )}
      {!isHouse && (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
          Esta receta genera la escena con IA y consume presupuesto de generación.
        </p>
      )}

      <button
        type="button"
        className="studio-generate"
        disabled={pending}
        onClick={submit}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          width: '100%', padding: '11px', fontSize: '13px', fontWeight: 500,
          borderRadius: '8px', cursor: pending ? 'default' : 'pointer',
          background: 'transparent', border: '1px solid var(--accent-gold)',
          color: 'var(--accent-gold)', opacity: pending ? 0.6 : 1,
          transition: 'background-color var(--dur-fast), color var(--dur-fast)',
        }}
      >
        {pending
          ? <><Loader2 size={14} className="animate-spin" /> Generando…</>
          : <><Sparkles size={14} /> {template ? 'Guardar en la biblioteca' : 'Generar imagen'}</>}
      </button>

      {preview && (
        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px' }}>
            Previsualización · todavía no está guardada
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- reason: data URI en memoria, no hay host que optimizar */}
          <img
            src={preview}
            alt="Previsualización"
            onClick={() => setZoomPreview(true)}
            style={{ width: '100%', display: 'block', borderRadius: '8px', border: '1px solid var(--border-subtle)', cursor: 'zoom-in' }}
          />
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Clic para verla en grande
          </div>
        </div>
      )}

      {zoomPreview && preview && (
        <Lightbox src={preview} alt="Previsualización" onClose={() => setZoomPreview(false)} />
      )}
    </div>
  )
}
