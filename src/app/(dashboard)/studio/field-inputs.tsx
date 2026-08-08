'use client'

// Inputs del Estudio. Se extraen aquí para que recipe-form.tsx quede legible:
// el formulario cambia por receta y no debe cargar además con el detalle de
// cada control. Convenciones copiadas de context-panel.tsx.

export const FIELD_LABEL: React.CSSProperties = {
  display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase',
  letterSpacing: '0.06em', marginBottom: '6px', fontWeight: 500,
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', fontSize: '13px', borderRadius: '8px',
  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
  color: 'var(--text-primary)', outline: 'none',
}

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={FIELD_LABEL}>{label}</label>
      {children}
      {hint && (
        <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginTop: '5px', lineHeight: 1.4 }}>
          {hint}
        </span>
      )}
    </div>
  )
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={{ ...inputStyle, ...props.style }} />
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={{ ...inputStyle, minHeight: '78px', resize: 'vertical', ...props.style }} />
}

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: { value: string; label: string }[]
}) {
  return (
    <select {...props} style={{ ...inputStyle, ...props.style }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

export function Toggle({ checked, onChange, label }: {
  checked: boolean; onChange: (v: boolean) => void; label: string
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px',
      color: 'var(--text-primary)', marginBottom: '14px', cursor: 'pointer',
    }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/** Colores como tags. El color picker nativo evita traer una dependencia. */
export function ColorTags({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
      {value.map(c => (
        <span
          key={c}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 8px',
            borderRadius: '6px', border: '1px solid var(--border-subtle)',
            fontSize: '12px', color: 'var(--text-secondary)',
          }}
        >
          <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: c, display: 'inline-block' }} />
          {c}
          <button
            type="button"
            onClick={() => onChange(value.filter(x => x !== c))}
            aria-label={`Quitar ${c}`}
            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </span>
      ))}
      {value.length < 4 && (
        <input
          type="color"
          aria-label="Agregar color"
          onChange={e => {
            const c = e.target.value.toUpperCase()
            if (!value.includes(c)) onChange([...value, c])
          }}
          style={{
            width: '34px', height: '30px', padding: 0, border: '1px solid var(--border-subtle)',
            borderRadius: '6px', background: 'transparent', cursor: 'pointer',
          }}
        />
      )}
    </div>
  )
}
