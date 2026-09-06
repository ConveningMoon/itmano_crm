'use client'

// Switch (toggle) accesible — reemplaza checkboxes donde un on/off se lee mejor
// como interruptor (ej. "Publicar en web"). Controlado: checked + onChange.

export function Switch({
  checked,
  onChange,
  disabled = false,
  'aria-label': ariaLabel,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        width: '40px',
        height: '22px',
        borderRadius: '999px',
        border: 'none',
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: checked ? 'var(--accent-gold)' : 'var(--bg-overlay)',
        transition: 'background 0.18s ease',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '3px',
          left: checked ? '21px' : '3px',
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          background: checked ? 'var(--bg-base)' : 'var(--text-muted)',
          transition: 'left 0.18s ease, background 0.18s ease',
        }}
      />
    </button>
  )
}
