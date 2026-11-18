import type { CalibrationLogEntry } from '@/lib/data/scoring-model'
import { DIM_UI_LABEL, type Dimension } from '@/lib/scoring/vocabulary'
import { FechaLocal } from '@/components/ui/local-date'

// Historial de calibraciones: qué cambió, cuándo y quién lo decidió. Sin estado.

const ORIGEN: Record<CalibrationLogEntry['source'], string> = {
  auto:   'Automática',
  manual: 'Manual',
  reset:  'Vuelta al modelo global',
}

function dim(d: string): string {
  return DIM_UI_LABEL[d as Dimension] ?? d
}

export function CalibrationLog({ entries, tenantName }: {
  entries: CalibrationLogEntry[]
  /** Nombre del tenant por id; se omite en la vista de un solo tenant. */
  tenantName?: (id: string) => string
}) {
  if (entries.length === 0) {
    return (
      <p className="settings-note">
        Todavía no hubo ninguna. La primera llegará sola cuando un tenant acumule 50 cierres con perfil.
      </p>
    )
  }

  return (
    <ul className="scoring-log">
      {entries.map(e => (
        <li key={e.id}>
          <span className="scoring-log-when">
            <FechaLocal fecha={e.createdAt} locale="es" opciones={{ day: 'numeric', month: 'short', year: 'numeric' }} />
          </span>
          {tenantName && <strong>{tenantName(e.tenantId)}</strong>}
          <span>{ORIGEN[e.source]}</span>
          <span>
            {e.source === 'reset'
              ? 'usa otra vez el orden global'
              : `primero ${e.orderAfter.slice(0, 3).map(dim).join(', ')}`}
          </span>
          {e.changes > 0 && <span className="scoring-usage">{e.changes} {e.changes === 1 ? 'punto cambió' : 'puntos cambiaron'}</span>}
        </li>
      ))}
    </ul>
  )
}
