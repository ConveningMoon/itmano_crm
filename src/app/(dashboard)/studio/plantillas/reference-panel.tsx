'use client'

import { useState } from 'react'
import { GRUPOS, CLASES_DE_ESTADO, rutaEnElRepo } from '@/lib/studio/templates/reference'

// La chuleta del contrato, dentro del editor.
//
// Existe porque las claves y las clases de estado no se recuerdan: se escribían
// a ciegas o mirando otro diseño. Va plegada para no estorbar, y lo que la
// convierte en herramienta en vez de en documentación es la última sección —
// **qué clases están activas ahora mismo**, con el escenario que se esté
// mirando. Sin eso hay que deducir a mano si toca `datos-4` o `datos-5`.

const chip: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '10px', padding: '1px 5px', borderRadius: '4px',
  // `--bg-elevated` y no un respaldo a negro translúcido: el CRM es oscuro, y
  // un negro al 5% sobre #0B0C0E deja el chip invisible — que fue justo lo que
  // pasó. Sobre el fondo elevado sí se lee como algo que se puede pulsar.
  background: 'var(--bg-elevated)', color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)', cursor: 'pointer',
}

export function ReferencePanel({ claveActual, clasesActivas, familias }: {
  /** La clave del diseño abierto, para decir dónde vive en el repo. */
  claveActual:   string
  /** Las clases que el motor pone AHORA, con el escenario elegido. */
  clasesActivas: string[]
  familias:      string[]
}) {
  const [copiado, setCopiado] = useState<string | null>(null)
  const rutas = rutaEnElRepo(claveActual)

  function copiar(texto: string) {
    navigator.clipboard?.writeText(texto).then(
      () => { setCopiado(texto); setTimeout(() => setCopiado(null), 1200) },
      () => { /* sin portapapeles: el texto sigue a la vista para copiarlo a mano */ },
    )
  }

  const activas = new Set(clasesActivas)

  return (
    <details style={{ marginTop: '16px', border: '1px solid var(--border-subtle)', borderRadius: '10px' }}>
      <summary style={{
        cursor: 'pointer', padding: '8px 10px', fontSize: '11px', fontWeight: 500,
        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        Qué puedo escribir
      </summary>

      <div style={{ padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {copiado && (
          <span style={{ fontSize: '10px', color: 'var(--accent-gold)' }}>Copiado: {copiado}</span>
        )}

        {/* Lo primero, porque es lo que se pierde: dónde está el archivo. */}
        <section>
          <h4 style={seccion}>En tu proyecto</h4>
          <p style={ayuda}>
            Los mismos HTML y CSS viven como archivos. Ábrelos en tu IDE para trabajar
            con comodidad y siembra con <code>npm run studio:seed</code>.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '4px' }}>
            <button type="button" style={{ ...chip, textAlign: 'left' }} onClick={() => copiar(rutas.html)}>
              {rutas.html}
            </button>
            <button type="button" style={{ ...chip, textAlign: 'left' }} onClick={() => copiar(rutas.css)}>
              {rutas.css}
            </button>
          </div>
        </section>

        <section>
          <h4 style={seccion}>Las tres formas</h4>
          <ul style={lista}>
            <li><code>{'{{clave}}'}</code> — pone el dato, escapado</li>
            <li><code>{'{{#clave}}…{{/clave}}'}</code> — el bloque desaparece si no hay dato. No se anidan</li>
            <li><code>{'{{&clave}}'}</code> — inserta un fragmento ya marcado, sin escapar</li>
          </ul>
        </section>

        {GRUPOS.map(g => (
          <section key={g.titulo}>
            <h4 style={seccion}>{g.titulo}</h4>
            <p style={ayuda}>{g.forma}</p>
            <ul style={lista}>
              {g.claves.map(c => (
                <li key={c.clave}>
                  <button type="button" style={chip}
                          onClick={() => copiar(g.titulo === 'Colores y lienzo' ? `var(--${c.clave})` : `{{${c.clave}}}`)}>
                    {c.clave}
                  </button>
                  {' '}<span style={{ color: 'var(--text-muted)' }}>{c.que}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section>
          <h4 style={seccion}>Clases de estado</h4>
          <p style={ayuda}>
            Van en el <code>&lt;html&gt;</code> según los datos reales, así que sirven
            en producción: <code>html.sin-precio .titular {'{ … }'}</code>. Las
            resaltadas son las activas con el escenario que estás viendo.
          </p>
          <ul style={lista}>
            {CLASES_DE_ESTADO.map(c => {
              // `fotos-N` y `datos-N` se documentan con la N; para saber si están
              // activas hay que mirar la que el motor emitió de verdad.
              const real = c.clave.endsWith('-N')
                ? clasesActivas.find(a => a.startsWith(c.clave.slice(0, -1)))
                : c.clave
              const activa = !!real && activas.has(real)
              return (
                <li key={c.clave}>
                  <button
                    type="button"
                    style={{
                      ...chip,
                      background: activa ? 'rgba(201, 169, 110, 0.25)' : chip.background,
                      borderColor: activa ? 'var(--accent-gold)' : 'var(--border-subtle)',
                    }}
                    onClick={() => copiar(`html.${real ?? c.clave} `)}
                  >
                    {real ?? c.clave}
                  </button>
                  {' '}<span style={{ color: 'var(--text-muted)' }}>{c.que}</span>
                </li>
              )
            })}
          </ul>
        </section>

        <section>
          <h4 style={seccion}>Fuentes</h4>
          <p style={ayuda}>{familias.join(' · ')}</p>
        </section>
      </div>
    </details>
  )
}

const seccion: React.CSSProperties = {
  fontSize: '11px', fontWeight: 500, color: 'var(--text-primary)', margin: '0 0 2px',
}

const ayuda: React.CSSProperties = {
  fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.45, margin: 0,
}

const lista: React.CSSProperties = {
  listStyle: 'none', margin: '4px 0 0', padding: 0,
  display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '10px', lineHeight: 1.5,
}
