'use client'

import { useMemo } from 'react'
import { COMMON_TIME_ZONES, isCuratedTimeZone, timeZoneLabel, utcOffsetLabel } from '@/lib/time-zones'

// Selector de zona horaria legible: primero las zonas curadas por región con
// nombres que un agente reconoce ("Este — Nueva York, Florida, Virginia…") y su
// desfase actual; al final, el resto de identificadores IANA para el caso raro.
// Lo usan el perfil de negocio y el formulario de open houses.

function otherZones(): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
    return all.filter(z => !isCuratedTimeZone(z))
  } catch {
    return []
  }
}

export function TimeZoneSelect({
  value, onChange, style, emptyLabel,
}: {
  value:       string
  onChange:    (tz: string) => void
  style?:      React.CSSProperties
  /** Si se pasa, agrega una primera opción vacía (p. ej. "Automática…"). */
  emptyLabel?: string
}) {
  const others = useMemo(() => otherZones(), [])

  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ cursor: 'pointer', ...style }}>
      {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
      {/* Una zona guardada que no está en ninguna lista se muestra igual. */}
      {value && !isCuratedTimeZone(value) && !others.includes(value) && (
        <option value={value}>{timeZoneLabel(value)}</option>
      )}
      {COMMON_TIME_ZONES.map(group => (
        <optgroup key={group.region} label={group.region}>
          {group.zones.map(z => (
            <option key={z.id} value={z.id}>{z.label} ({utcOffsetLabel(z.id)})</option>
          ))}
        </optgroup>
      ))}
      {others.length > 0 && (
        <optgroup label="Otras zonas">
          {others.map(z => <option key={z} value={z}>{timeZoneLabel(z)}</option>)}
        </optgroup>
      )}
    </select>
  )
}
