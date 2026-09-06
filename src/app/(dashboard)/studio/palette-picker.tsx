'use client'

import { PALETTE_PRESETS, PALETTE_ROLES, samePalette, tenantPreset, type StudioPalette } from '@/lib/studio/palettes'

// Los colores por ROL, con presets. "Elige colores" no es una pregunta
// respondible; "¿de qué color son las bandas?" sí. Los presets resuelven el caso
// normal de un clic y los selectores quedan para quien quiera afinar.

export function PalettePicker({ value, onChange, tenantColor }: {
  value:       StudioPalette
  onChange:    (p: StudioPalette) => void
  tenantColor: string
}) {
  // El preset del tenant va primero y se arma en runtime: su color es dato de la
  // base, no puede estar en la lista de código.
  const presets = [tenantPreset(tenantColor), ...PALETTE_PRESETS]

  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{
        display: 'block', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: '6px', fontWeight: 500,
      }}>
        Colores
      </label>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        {presets.map(preset => {
          const active = samePalette(preset.palette, value)
          return (
            <button
              key={preset.key}
              type="button"
              onClick={() => onChange(preset.palette)}
              title={preset.label}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                padding: '5px 9px', fontSize: '11px', borderRadius: '6px', cursor: 'pointer',
                background: 'transparent',
                border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                color: active ? 'var(--accent-gold)' : 'var(--text-muted)',
              }}
            >
              <span style={{ display: 'flex' }}>
                {[preset.palette.brand, preset.palette.surface, preset.palette.ink].map((c, i) => (
                  <span key={i} style={{
                    width: '11px', height: '11px', background: c, borderRadius: '2px',
                    marginLeft: i ? '-2px' : 0, border: '1px solid rgba(0,0,0,0.25)',
                  }} />
                ))}
              </span>
              {preset.label}
            </button>
          )
        })}
      </div>

      {/* Cada color dice para qué es. Antes eran cuatro hex sin dueño de los que
          solo el primero hacía algo. */}
      <div style={{ display: 'grid', gap: '8px' }}>
        {PALETTE_ROLES.map(role => (
          <label key={role.key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="color"
              value={value[role.key]}
              onChange={e => onChange({ ...value, [role.key]: e.target.value.toUpperCase() })}
              aria-label={role.label}
              style={{
                width: '34px', height: '28px', padding: 0, flexShrink: 0, cursor: 'pointer',
                border: '1px solid var(--border-subtle)', borderRadius: '6px', background: 'transparent',
              }}
            />
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '12px', color: 'var(--text-primary)' }}>{role.label}</span>
              <span style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)' }}>{role.hint}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
