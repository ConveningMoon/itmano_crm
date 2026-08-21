'use client'

import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { html as htmlLang } from '@codemirror/lang-html'
import { css as cssLang } from '@codemirror/lang-css'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'

// El panel de código del editor de plantillas.
//
// Antes eran dos `<textarea>`, y el problema no era el color: era que en 200
// líneas de CSS no hay forma de BUSCAR. CodeMirror trae lo que se echaba en
// falta — resaltado de verdad, Ctrl+F, plegado de bloques, números de línea y
// emparejado de etiquetas — y sigue siendo un componente controlado, así que la
// vista previa se recalcula igual a cada tecla.
//
// Es cliente y sólo se carga en esta ruta: no entra en el bundle de nadie más.

/** Los colores salen de los tokens del CRM para que no sea una isla ajena. */
const temaItmano = EditorView.theme({
  '&': {
    fontSize: '12px',
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
  },
  '&.cm-focused': { outline: '2px solid var(--accent-gold)', outlineOffset: '-2px' },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    padding: '10px 0',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
  },
  '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  // El panel de búsqueda es la razón principal de todo esto: que se vea.
  '.cm-panels': {
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-primary)',
    borderTop: '1px solid var(--border-subtle)',
  },
  '.cm-searchMatch': { backgroundColor: 'rgba(224, 168, 74, 0.35)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(224, 168, 74, 0.7)' },
})

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
    () => [lenguaje === 'html' ? htmlLang() : cssLang(), temaItmano, enEspanol, EditorView.lineWrapping],
    [lenguaje],
  )

  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
      {etiqueta}
      <CodeMirror
        value={valor}
        height={`${alto}px`}
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
