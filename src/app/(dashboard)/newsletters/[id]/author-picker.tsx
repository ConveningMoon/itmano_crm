'use client'

// Selector de quién firma la edición. La opción "La agencia" no es un vacío:
// es una firma válida y explícita (value = ''), distinta de "todavía no elegí".

export type AuthorOption = { id: string; name: string }

export function AuthorPicker({
  agents, value, tenantName, onChange, disabled,
}: {
  agents:     AuthorOption[]
  value:      string | null
  tenantName: string
  onChange:   (agentId: string | null) => void
  disabled?:  boolean
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{
        display: 'block', fontSize: '12px', fontWeight: 500,
        color: 'var(--text-secondary)', marginBottom: '6px',
      }}>
        Firma
      </span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={e => onChange(e.target.value || null)}
        style={{
          width: '100%', padding: '8px 10px', borderRadius: '8px',
          border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
          color: 'var(--text-primary)', fontSize: '13px',
        }}
      >
        <option value="">{tenantName}</option>
        {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
      <span style={{
        display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px',
      }}>
        Quien firma esta edición en la web. Aparece en la página pública y es lo que
        asocia el contenido a esa persona en los buscadores.
      </span>
    </label>
  )
}
