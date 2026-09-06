'use client'

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { html as htmlLang } from '@codemirror/lang-html'
import { css as cssLang } from '@codemirror/lang-css'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

// El panel de código del editor de plantillas.
//
// Antes eran dos `<textarea>`, y el problema no era el color: era que en 200
// líneas de CSS no hay forma de BUSCAR. CodeMirror trae lo que se echaba en
// falta — resaltado de verdad, Ctrl+F, plegado de bloques, números de línea y
// emparejado de etiquetas — y sigue siendo un componente controlado, así que la
// vista previa se recalcula igual a cada tecla.
//
// Es cliente y sólo se carga en esta ruta: no entra en el bundle de nadie más.

// Los colores del CRM, que es oscuro. Se escriben literales y no como
// `var(--…)` porque un HighlightStyle de CodeMirror genera reglas CSS sueltas
// donde la variable no siempre está en ámbito, y un token sin color acaba
// heredando el del texto base — que fue exactamente el fallo que esto corrige:
// fondo claro con caracteres casi del mismo color, invisibles.
const FONDO   = '#111215'   // --bg-surface
const TEXTO   = '#E8E6E1'   // --text-primary
// El canal de números tampoco usa --text-muted por lo mismo: a 3,4:1 los
// números de línea se adivinan más que se leen, y son la referencia para saltar
// a un sitio del archivo.
const APAGADO = '#8A867E'
// Los comentarios NO usan --text-muted: sobre #111215 da 3,4:1, por debajo del
// mínimo legible, y en estas plantillas los comentarios explican el porqué de
// cada decisión. Este verde apagado los deja distinguibles de la puntuación sin
// competir con el código.
const COMENTARIO = '#7F8B78'
const ORO     = '#C9A96E'   // --accent-gold, el mismo de toda la interfaz

/**
 * El tema del editor.
 *
 * Se pasa por la prop `theme`, NO dentro de `extensions`: el envoltorio aplica
 * su tema claro por defecto después de las extensiones, así que desde ahí el
 * fondo se perdía y quedaba blanco. La marca `dark: true` no es decorativa —
 * con ella CodeMirror elige el cursor, la selección y los resaltados propios de
 * un tema oscuro.
 */
const temaItmano = EditorView.theme({
  '&': {
    fontSize: '12px',
    backgroundColor: FONDO,
    color: TEXTO,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
  },
  '.cm-scroller': { backgroundColor: FONDO },
  '&.cm-focused': { outline: '2px solid var(--accent-gold)', outlineOffset: '-2px' },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    padding: '10px 0',
    caretColor: ORO,
  },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: ORO },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'rgba(201, 169, 110, 0.25)',
  },
  '.cm-gutters': {
    backgroundColor: FONDO,
    border: 'none',
    color: APAGADO,
  },
  '.cm-lineNumbers .cm-gutterElement': { color: APAGADO },
  '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.035)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: TEXTO },
  '.cm-foldPlaceholder': { backgroundColor: 'rgba(255,255,255,0.08)', border: 'none', color: APAGADO },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'rgba(201, 169, 110, 0.25)', outline: 'none',
  },
  // El panel de búsqueda es la razón principal de todo esto: que se vea.
  '.cm-panels': { backgroundColor: '#17181C', color: TEXTO, borderTop: '1px solid rgba(255,255,255,0.08)' },
  '.cm-panels input, .cm-panels button': {
    backgroundColor: FONDO, color: TEXTO, border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '4px', padding: '2px 6px',
  },
  '.cm-searchMatch': { backgroundColor: 'rgba(201, 169, 110, 0.28)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(201, 169, 110, 0.6)' },
  '.cm-tooltip': { backgroundColor: '#17181C', border: '1px solid rgba(255,255,255,0.12)', color: TEXTO },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'rgba(201, 169, 110, 0.2)', color: TEXTO },
}, { dark: true })

/**
 * Los colores de la sintaxis, elegidos contra #111215.
 *
 * Cada familia de token lleva color explícito: lo que no se declara hereda el
 * del texto base, y ahí es donde nacen los caracteres que no se ven.
 */
const sintaxisItmano = HighlightStyle.define([
  { tag: t.comment,                     color: COMENTARIO, fontStyle: 'italic' },
  { tag: [t.tagName, t.standard(t.tagName)], color: '#7FB3D5' },
  { tag: [t.attributeName, t.propertyName], color: ORO },
  { tag: [t.string, t.attributeValue],  color: '#A8C686' },
  { tag: [t.number, t.unit, t.bool],    color: '#C99BC8' },
  { tag: [t.keyword, t.atom, t.modifier], color: '#C99BC8' },
  { tag: [t.className, t.labelName],    color: '#8FD1C4' },
  { tag: t.color,                       color: '#E0A87A' },
  { tag: [t.punctuation, t.separator, t.bracket, t.angleBracket], color: '#8A867E' },
  { tag: t.operator,                    color: '#8A867E' },
  { tag: t.invalid,                     color: '#E06C75' },
  // Lo que no encaje en nada de lo anterior: legible, nunca del color del fondo.
  { tag: t.content,                     color: TEXTO },
], { themeType: 'dark' })

// El panel de búsqueda de CodeMirror viene en inglés. Es superficie de producto
// —la usa quien diseña, aunque hoy sea sólo ITMANO— y el resto del CRM está en
// español, así que se traduce. Las claves son las que usa @codemirror/search.
const enEspanol = EditorState.phrases.of({
  'Find':          'Buscar',
  'Replace':       'Reemplazar',
  'next':          'siguiente',
  'previous':      'anterior',
  'all':           'todo',
  'match case':    'coincidir mayúsculas',
  'by word':       'palabra completa',
  'regexp':        'expresión regular',
  'replace':       'reemplazar',
  'replace all':   'reemplazar todo',
  'close':         'cerrar',
  'Go to line':    'Ir a la línea',
  'go':            'ir',
  'on line':       'en la línea',
})

export function CodeEditor({ lenguaje, valor, onChange, alto, etiqueta }: {
  lenguaje: 'html' | 'css'
  valor:    string
  onChange: (valor: string) => void
  /** Alto del área de código, en píxeles. */
  alto:     number
  etiqueta: string
}) {
  const extensiones = useMemo(
    () => [
      lenguaje === 'html' ? htmlLang() : cssLang(),
      syntaxHighlighting(sintaxisItmano),
      enEspanol,
      EditorView.lineWrapping,
    ],
    [lenguaje],
  )

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
      {etiqueta}
      <CodeMirror
        value={valor}
        height={`${alto}px`}
        theme={temaItmano}
        extensions={extensiones}
        onChange={onChange}
        basicSetup={{
          lineNumbers:        true,
          foldGutter:         true,
          bracketMatching:    true,
          closeBrackets:      true,
          autocompletion:     true,
          highlightActiveLine: true,
          searchKeymap:       true,
          // El resaltado de la selección ayuda a seguir una clase repetida por
          // todo el archivo, que es justo lo que se busca al ajustar un diseño.
          highlightSelectionMatches: true,
        }}
        aria-label={etiqueta}
      />
    </label>
  )
}
