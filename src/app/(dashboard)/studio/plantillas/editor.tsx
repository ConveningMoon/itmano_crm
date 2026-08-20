'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { buildTemplateDocument } from '@/lib/studio/templates/document'
import { templateValues, templateRawValues, templateFlags, paletteVars } from '@/lib/studio/templates/values'
import { sampleProps, SCENARIOS, type ScenarioKey } from '@/lib/studio/sample-data'
import { imageKeysIn } from '@/lib/studio/templates/slots'
import { type MockupMap } from '@/lib/studio/mockups'
import { MockupPanel } from './mockup-panel'
import { CodeEditor } from './code-editor'
import { CANVAS } from '@/lib/studio/canvas'
import { saveTemplateAction } from './actions'
import type { TemplateMeta } from '@/lib/studio/templates/meta'
import type { TemplateRecord } from '@/lib/data/studio-templates'
import type { StudioRecipe, Aspect } from '@/lib/studio/types'

// La vista previa NO es una aproximación: llama a la misma buildTemplateDocument
// que el servidor le pasa a Chrome. Lo único que cambia es que aquí las fuentes
// y las fotos viajan por URL en vez de en data:.

const RECIPES: Array<{ key: StudioRecipe; label: string }> = [
  { key: 'new_listing', label: 'Nueva disponible' },
  { key: 'open_house',  label: 'Casa abierta' },
  { key: 'sold',        label: 'Vendida' },
  { key: 'event',       label: 'Evento' },
]

const codeStyle: React.CSSProperties = {
  width: '100%', height: '100%', minHeight: '260px', resize: 'none',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', lineHeight: 1.5,
  background: 'var(--bg-surface)', color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px',
}

export function TemplateEditor({
  templates, current, fontFaceCss, families,
  imagenes: imagenesIniciales, subidas,
}: {
  templates:   TemplateMeta[]
  current:     TemplateRecord | null
  fontFaceCss: string
  families:    string[]
  /** El juego de imágenes de ejemplo ya resuelto (lo subido, o lo del repo). */
  imagenes:    MockupMap
  /** Cuáles de ellas son propias, para poder decirlo y poder quitarlas. */
  subidas:     string[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [key, setKey]         = useState(current?.key ?? '')
  const [label, setLabel]     = useState(current?.label ?? '')
  const [hint, setHint]       = useState(current?.hint ?? '')
  const [recipes, setRecipes] = useState<StudioRecipe[]>(current?.recipes ?? ['new_listing'])
  const [aspects]             = useState<Aspect[]>(current?.aspects ?? ['4:5'])
  const [html, setHtml]       = useState(current?.html ?? '<main class="pieza">\n  <h1>{{&headlineRitmo}}</h1>\n</main>')
  const [css, setCss]         = useState(current?.css ?? '.pieza{width:var(--w);height:var(--h);background:var(--surface);color:var(--ink)}\nh1{font-family:Spectral;font-size:64px;padding:60px}')
  const [scenario, setScenario] = useState<ScenarioKey>('completo')

  // Las imágenes viven en estado para que subir una cambie la vista previa al
  // instante, sin recargar la página.
  const [imagenes, setImagenes] = useState<MockupMap>(imagenesIniciales)
  const [propias, setPropias]   = useState<Set<string>>(() => new Set(subidas))

  const { width, height } = CANVAS[aspects[0]]

  // Qué huecos de imagen usa este diseño. Se recalcula con el HTML porque el
  // panel tiene que seguir a lo que se está escribiendo, no a lo guardado.
  const clavesDeImagen = useMemo(() => imageKeysIn(html), [html])

  // Se recalcula en cada tecla: es barato (una sustitución de cadenas) y es todo
  // el bucle de trabajo que este proyecto viene a dar.
  const document = useMemo(() => {
    const props = sampleProps(recipes[0], scenario, imagenes)
    return buildTemplateDocument({
      html, css,
      values: templateValues(props), rawValues: templateRawValues(props),
      vars: paletteVars(props.palette), flags: templateFlags(props),
      fontFaceCss, width, height,
    })
  }, [html, css, recipes, scenario, imagenes, fontFaceCss, width, height])

  function cambioDeImagen(key: string, url: string, esPropia: boolean) {
    setImagenes(prev => ({ ...prev, [key]: url }))
    setPropias(prev => {
      const siguiente = new Set(prev)
      if (esPropia) siguiente.add(key)
      else siguiente.delete(key)
      return siguiente
    })
  }

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const r = await saveTemplateAction({ key, label, hint, recipes, aspects, html, css })
      if (r.ok) { setSaved(true); router.refresh() } else { setError(r.error); router.refresh() }
    })
  }

  return (
    <div style={{ display: 'grid', gap: '20px', gridTemplateColumns: 'minmax(0, 1fr) 420px', alignItems: 'start' }}
         className="max-md:!grid-cols-1">
      <style>{`.tpl-tab:hover{border-color:var(--accent-gold)!important}`}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select
            value={current?.key ?? ''}
            onChange={e => router.push(e.target.value ? `/studio/plantillas?key=${e.target.value}` : '/studio/plantillas')}
            aria-label="Diseño a editar"
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
                     background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12px' }}
          >
            <option value="">Diseño nuevo</option>
            {templates.map(t => <option key={t.key} value={t.key}>{t.label} · {t.key}</option>)}
          </select>

          <select
            value={scenario}
            onChange={e => setScenario(e.target.value as ScenarioKey)}
            aria-label="Escenario de datos"
            style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)',
                     background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '12px' }}
          >
            {SCENARIOS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>

          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Fuentes: {families.join(' · ')}
          </span>
        </div>

        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: '1fr 1fr' }}>
          <CodeEditor etiqueta="HTML" lenguaje="html" valor={html} onChange={setHtml} alto={420} />
          <CodeEditor etiqueta="CSS"  lenguaje="css"  valor={css}  onChange={setCss}  alto={420} />
        </div>

        <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Clave
            <input value={key} onChange={e => setKey(e.target.value)} disabled={!!current}
                   style={{ ...codeStyle, height: '32px', minHeight: 0 }} />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Nombre
            <input value={label} onChange={e => setLabel(e.target.value)}
                   style={{ ...codeStyle, height: '32px', minHeight: 0 }} />
          </label>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Pista
            <input value={hint} onChange={e => setHint(e.target.value)}
                   style={{ ...codeStyle, height: '32px', minHeight: 0 }} />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {RECIPES.map(r => (
            <label key={r.key} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={recipes.includes(r.key)}
                onChange={e => setRecipes(prev => e.target.checked ? [...prev, r.key] : prev.filter(x => x !== r.key))}
              />
              {r.label}
            </label>
          ))}
          <button type="button" onClick={save} disabled={pending}
                  style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
                           padding: '8px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                           background: 'var(--accent-gold)', color: 'var(--bg-base)', fontSize: '12px', fontWeight: 500 }}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Guardar
          </button>
        </div>

        {error && <p style={{ fontSize: '12px', color: 'var(--status-lost, #c96b6b)' }}>{error}</p>}
        {saved && <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Guardado, con su miniatura.</p>}
      </div>

      <div style={{ position: 'sticky', top: '20px' }}>
        {/* Un iframe no escala su contenido: es una ventana. Para ver la pieza
            ENTERA (no sólo la esquina superior izquierda) el iframe sigue
            renderizando al tamaño real del lienzo — el mismo documento que
            produce el PNG — y lo reducimos con transform: scale() dentro de
            un marco recortado a ese mismo tamaño. La escala sale del ancho
            fijo del marco (420px) sobre el ancho real del lienzo, así que
            sirve igual para 4:5, 1:1 o 9:16. */}
        <div style={{ width: '420px', height: `${Math.round(420 * height / width)}px`,
                      overflow: 'hidden', border: '1px solid var(--border-subtle)',
                      borderRadius: '12px',
                      // El blanco es el papel de la pieza (el lienzo sobre el
                      // que se diseña), no interfaz del CRM: se queda fijo
                      // pase lo que pase con el tema, igual que el fondo de
                      // una hoja en cualquier editor de diseño.
                      background: '#fff' }}>
          {/* `allow-same-origin` SIN `allow-scripts`. La combinación de los dos
              es la peligrosa —un marco con script y origen propio puede quitarse
              su propio sandbox—, pero por separado el primero es sólo lo que
              hace que el documento pueda cargar sus imágenes y sus fuentes: con
              origen opaco el navegador las bloquea y la vista previa sale con
              los huecos vacíos y la tipografía del sistema, sin un solo error.
              El HTML de la plantilla sigue sin poder ejecutar nada, que es el
              cierre que importa (decisión 14 del spec). */}
          <iframe
            title="Vista previa"
            srcDoc={document}
            sandbox="allow-same-origin"
            style={{ width: `${width}px`, height: `${height}px`, border: 'none',
                     transform: `scale(${420 / width})`, transformOrigin: 'top left' }}
          />
        </div>
        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          {width}×{height} · el mismo documento que se convierte en PNG
        </p>

        <MockupPanel
          claves={clavesDeImagen}
          imagenes={imagenes}
          propias={propias}
          onCambio={cambioDeImagen}
        />
      </div>
    </div>
  )
}
