'use client'

import { useMemo, useState, useTransition } from 'react'
import { Loader2, Sparkles, Eye } from 'lucide-react'
import { createStudioImage, previewStudioImage } from './actions'
import { TemplatePicker } from './template-picker'
import { Lightbox } from './lightbox'
import { templatesForRecipe, findTemplate } from '@/lib/studio/templates/registry'
import { HEADLINE_MAX, BADGE_MAX, STAT_LABEL_MAX } from '@/lib/studio/recipes'
import { Field, TextInput, TextArea, Select, Section } from './field-inputs'
import { PalettePicker } from './palette-picker'
import { HeroPicker } from './hero-picker'
import type { ReferenceItem } from './reference-picker'
import { DEFAULT_PALETTE, tenantPreset, paletteLabel, type StudioPalette } from '@/lib/studio/palettes'
import type { AgentOption, PropertyOption } from '@/lib/data/studio'
import type { StudioImage } from '@/lib/studio/types'

// Formulario del generador. Una receta = un formulario distinto, no uno genérico
// con campos opcionales: los datos que pide cada pieza son los que acaban
// escritos en la imagen, y validarlos completos ANTES de generar es lo que evita
// imprecisiones y gasto de tokens.

// El prompt abierto ya no es una receta de esta pestaña: vive en "Mi Imagen".
// Estas cuatro tienen en común que el CRM sabe qué va escrito en la pieza.
const RECIPES = [
  { key: 'open_house',  label: 'Casa abierta' },
  { key: 'new_listing', label: 'Nueva disponible' },
  { key: 'sold',        label: 'Vendida' },
  { key: 'event',       label: 'Evento' },
]

const HOUSE_RECIPES = ['open_house', 'new_listing', 'sold']

// El encabezado por defecto de cada receta. Espeja BADGES de template-props:
// aquí solo se usa como placeholder y para decir qué saldrá si se deja vacío.
const DEFAULT_BADGES: Record<string, string> = {
  open_house:  'CASA ABIERTA',
  new_listing: 'NUEVA DISPONIBLE',
  sold:        'VENDIDA',
  event:       'EVENTO',
}

const STAT_LABEL_FIELDS = [
  { key: 'bedrooms_label',  placeholder: 'hab',   aria: 'Cómo se llaman las habitaciones' },
  { key: 'bathrooms_label', placeholder: 'baños', aria: 'Cómo se llaman los baños' },
  { key: 'sqft_label',      placeholder: 'sqft',  aria: 'Cómo se llama la superficie' },
]

const ASPECTS = [
  { value: '4:5',  label: '4:5 · feed alto' },
  { value: '1:1',  label: '1:1 · feed cuadrado' },
  { value: '9:16', label: '9:16 · story' },
]

type Fields = Record<string, unknown>

function num(v: string): number | undefined {
  const n = Number(v.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * El diseño con el que arranca una receta: el primero que la declara, y cadena
 * vacía cuando no tiene ninguno (evento y prompt abierto, que van con IA).
 *
 * Abrir SIN diseño dejaba el formulario en el camino con IA —el que cuesta— y
 * sin previsualización, y eso se leía como que la previsualización había
 * desaparecido. El camino gratis tiene que ser el que se encuentra sin buscarlo.
 */
function firstTemplateFor(recipe: string): string {
  return templatesForRecipe(recipe as never)[0]?.key ?? ''
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
  const [aspect, setAspect] = useState('4:5')
  const [scenePrompt, setScenePrompt] = useState('')
  const [heroFile, setHeroFile] = useState<ReferenceItem | null>(null)
  const [propertyId, setPropertyId] = useState('')
  const [agentId, setAgentId] = useState('')
  const [template, setTemplate] = useState(() => firstTemplateFor('new_listing'))
  const [headline, setHeadline] = useState('')
  const [badge, setBadge] = useState('')
  const [preview, setPreview] = useState<string | null>(null)
  const [zoomPreview, setZoomPreview] = useState(false)
  // Qué bloque está abierto. Contenido y Diseño arrancan abiertos porque son las
  // decisiones que se tocan siempre; Colores y Escena, cerrados con su resumen a
  // la vista, para que cerrado no signifique escondido.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    contenido: true, diseno: true, colores: false,
  })
  const toggle = (k: string) => setOpenSections(prev => ({ ...prev, [k]: !prev[k] }))

  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isHouse = HOUSE_RECIPES.includes(recipe)
  const property = useMemo(() => properties.find(p => p.id === propertyId) ?? null, [properties, propertyId])
  // Con propiedad elegida se usan SUS fotos, y con una imagen subida esa. Solo
  // queda la IA cuando no hay ninguna de las dos y el agente describió la
  // escena — que es el único caso en que hay algo que inventar.
  const usesAi = !propertyId && !heroFile && !!scenePrompt.trim()
  const templates = useMemo(() => templatesForRecipe(recipe as never), [recipe])
  const agent = agents.find(a => a.id === agentId)
  // Los formatos que admite el diseño elegido. Sin diseño (camino con IA) valen
  // los tres: ahí el lienzo lo compone el compositor de bandas, que sí es
  // sensible al formato.
  const allowedAspects: string[] = template
    ? (findTemplate(template)?.aspects as string[] | undefined) ?? ['4:5']
    : ASPECTS.map(a => a.value)
  const templateLabel = templates.find(t => t.key === template)?.label
  const contentSummary =
    [property?.address ?? (fields.address ? String(fields.address) : null), agent?.name]
      .filter(Boolean).join(' · ') || 'Sin completar'
  const designSummary = `${templateLabel ?? 'Sin diseño'} · ${aspect}`
  const colorSummary  = paletteLabel(palette, tenantColor)

  function set(key: string, value: unknown) {
    setFields(prev => ({ ...prev, [key]: value }))
  }

  // Autorrelleno al elegir propiedad. Se hace en el handler y no en un efecto
  // para no volver a pisar lo que el usuario ya editó a mano.
  /** Subir imagen y describirla son excluyentes: llenan el mismo hueco. */
  function chooseHero(item: ReferenceItem | null) {
    setHeroFile(item)
    setPreview(null)
    if (item) setScenePrompt('')
  }

  function selectProperty(id: string) {
    setPropertyId(id)
    setPreview(null)
    if (!id) return
    // Elegir propiedad apaga las otras dos vías: sus fotos son las que van.
    setScenePrompt('')
    chooseHero(null)
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

  function applyTemplate(key: string) {
    setTemplate(key)
    if (!key) return
    // Si el formato actual no lo admite el diseño nuevo, se corrige solo en vez
    // de dejar una combinación que produciría una pieza recortada.
    const allowed = (findTemplate(key)?.aspects as string[] | undefined) ?? ['4:5']
    if (!allowed.includes(aspect)) setAspect(allowed[0])
  }

  function chooseTemplate(key: string) {
    applyTemplate(key)
    setPreview(null)
  }

  function changeRecipe(key: string) {
    setRecipe(key)
    setFields({})
    setPropertyId('')
    setScenePrompt('')
    setBadge('')
    chooseHero(null)
    // Un diseño solo sirve para las recetas que declara: al cambiar de receta
    // deja de ser válido y se pasa al primero de la nueva.
    applyTemplate(firstTemplateFor(key))
    setPreview(null)
  }

  function buildPayload() {
    return {
      ...fields,
      recipe, aspect, palette,
      // Con propiedad se usan sus fotos; sin ella, la escena que se describió.
      source_mode: propertyId ? 'photo' : 'generate',
      template:    template || undefined,
      headline:    headline || undefined,
      badge:       badge || undefined,
      // El prompt de propiedad viaja en el campo de siempre: es la clave que
      // las piezas ya guardadas tienen en su form_json.
      scene_notes: scenePrompt.trim() || undefined,
      property_id: propertyId || undefined,
      agent_id:    agentId || undefined,
    }
  }

  function formData(): FormData {
    const data = new FormData()
    data.set('payload', JSON.stringify(buildPayload()))
    // Va también a previsualizar: con la foto ya subida, ver el resultado no
    // cuesta nada y no habría razón para esconder el botón.
    if (heroFile) data.set('hero', heroFile.file)
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

      <Section title="Contenido" summary={contentSummary} open={openSections.contenido} onToggle={() => toggle('contenido')}>
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

      {/* La imagen principal SOLO se pide sin propiedad elegida: con una, son
          sus fotos. Hay dos formas de darla y son excluyentes — subir la que ya
          tienes (gratis) o describir la que no tienes (con IA). */}
      {!propertyId && (
        <>
          <HeroPicker file={heroFile} onChange={chooseHero} />

          {!heroFile && (
            <Field
              label={recipe === 'event' ? 'Prompt del evento' : 'Prompt de propiedad'}
              hint={recipe === 'event'
                ? 'O descríbela y la genera la IA. Sin foto ni prompt, el diseño se dibuja sin imagen.'
                : 'O descríbela y la genera la IA. Sin foto ni prompt, el diseño se dibuja sin imagen.'}
            >
              <TextArea
                value={scenePrompt}
                maxLength={500}
                onChange={e => { setScenePrompt(e.target.value); setPreview(null) }}
                placeholder="colonial de ladrillo con porche, frente al agua, luz de atardecer…"
              />
            </Field>
          )}
        </>
      )}

      <Field
        label="Encabezado"
        hint={`Opcional. Sin él se usa "${DEFAULT_BADGES[recipe] ?? ''}". ${badge.length}/${BADGE_MAX}`}
      >
        <TextInput
          value={badge}
          maxLength={BADGE_MAX}
          onChange={e => setBadge(e.target.value)}
          placeholder={DEFAULT_BADGES[recipe] ?? ''}
        />
      </Field>

      {recipe !== 'event' && (
        <Field
          label="Titular"
          hint={`Opcional. Sin él se usa uno por defecto según la receta. ${headline.length}/${HEADLINE_MAX}`}
        >
          <TextInput
            value={headline}
            maxLength={HEADLINE_MAX}
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

          {/* Cómo se llama cada característica EN LA PIEZA. "sqft" no significa
              nada fuera de Estados Unidos y "hab" no es lo que escribiría una
              agencia de Barcelona. Una palabra cada una: van en la misma fila. */}
          <Field label="Cómo se llaman" hint={`Opcional. Una palabra cada una, máximo ${STAT_LABEL_MAX} caracteres.`}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              {STAT_LABEL_FIELDS.map(f => (
                <TextInput
                  key={f.key}
                  value={String(fields[f.key] ?? '')}
                  maxLength={STAT_LABEL_MAX}
                  aria-label={f.aria}
                  onChange={e => set(f.key, e.target.value.replace(/\s/g, '') || undefined)}
                  placeholder={f.placeholder}
                />
              ))}
            </div>
          </Field>
        </>
      )}

      {recipe === 'sold' && (
        <>
          <Field label="Dirección o zona">
            <TextInput value={String(fields.address ?? '')} onChange={e => set('address', e.target.value)} placeholder="Ghent, Norfolk" />
          </Field>
        </>
      )}

      {recipe === 'event' && (
        <>
          {/* El título ES el titular de un evento: no hay un segundo campo que
              compita con él. */}
          <Field label="Título">
            <TextInput value={String(fields.title ?? '')} onChange={e => set('title', e.target.value)} placeholder="Seminario para compradores primerizos" />
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
          <Field label="Cómo registrarse">
            <TextInput value={String(fields.signup ?? '')} onChange={e => set('signup', e.target.value || undefined)} placeholder="itmano.com/eventos" />
          </Field>
        </>
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

      </Section>

      <Section title="Diseño" summary={designSummary} open={openSections.diseno} onToggle={() => toggle('diseno')}>
      {/* Diseño: se elige mirando, no de una lista de nombres. La condición es
          "esta receta TIENE diseños", no "es una receta de casa": evento
          también los tiene desde que existe la familia de eventos. */}
      {templates.length > 0 && (
        <TemplatePicker
          templates={templates.map(t => ({
            key: t.key, label: t.label, hint: t.hint, recipes: t.recipes, aspects: t.aspects,
            slots: t.slots, idealPhotos: t.idealPhotos, thumbUrl: null,
          }))}
          value={template}
          onChange={chooseTemplate}
          photoCount={property?.photos.length ?? 0}
          hasAgentPhoto={!!agent?.cover_photo_url}
          showFit={!!propertyId}
        />
      )}

      {/* El selector solo aparece si hay algo que elegir. Los diseños de esta
          entrega están compuestos para 4:5, así que con uno elegido el campo
          tendría una sola opción: un control que no decide nada es ruido. */}
      {allowedAspects.length > 1 ? (
        <Field label="Formato">
          <Select
            value={aspect}
            onChange={e => setAspect(e.target.value)}
            options={ASPECTS.filter(a => allowedAspects.includes(a.value))}
          />
        </Field>
      ) : (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px', lineHeight: 1.45 }}>
          Formato {aspect} — el que compone este diseño.
        </p>
      )}

      </Section>

      <Section title="Colores" summary={colorSummary} open={openSections.colores} onToggle={() => toggle('colores')}>
      <PalettePicker value={palette} onChange={setPalette} tenantColor={tenantColor} />

      </Section>

      {error && (
        <p style={{ fontSize: '12px', color: 'var(--status-lost, #c96b6b)', margin: '0 0 12px' }}>{error}</p>
      )}

      {/* Previsualizar solo existe donde es gratis. Con escena generada, cada
          vista costaría lo mismo que la pieza final. */}
      {template && !usesAi && (
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

      {usesAi ? (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
          La escena se genera con IA y consume presupuesto de generación.
        </p>
      ) : template ? (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
          {propertyId
            ? 'Este diseño usa las fotos y los datos de la propiedad: no consume generación con IA. Previsualiza las veces que quieras.'
            : heroFile
              ? 'Este diseño usa la imagen que subiste: no consume generación con IA. Previsualiza las veces que quieras.'
              : 'Sin imagen ni prompt, el diseño se dibuja sin foto. No consume generación con IA.'}
        </p>
      ) : (
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.45 }}>
          Elige un diseño para componer la pieza sin costo.
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
        {/* El icono de IA solo aparece cuando de verdad se llama a la IA:
            ponerlo en una pieza compuesta con sharp anunciaba un costo que no
            existe. */}
        {pending
          ? <><Loader2 size={14} className="animate-spin" /> {usesAi ? 'Generando…' : 'Guardando…'}</>
          : usesAi
            ? <><Sparkles size={14} /> Generar imagen</>
            : <>Guardar en la biblioteca</>}
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
