import { Skeleton } from '@/components/ui/skeleton'

// Forma real de /settings: navegación lateral a la izquierda y una tarjeta con
// filas a la derecha. Usa .settings-layout, así que se apila igual a 980 px.
export function SettingsBodySkeleton() {
  return (
    <div className="settings-layout" aria-busy="true">
      <div className="settings-nav" style={{ gap: '8px' }}>
        {[0, 1, 2, 3, 4].map(i => (
          <Skeleton key={i} w="150px" h={34} r={9} style={{ flex: 'none' }} />
        ))}
      </div>
      <div className="settings-card">
        <div style={{ marginBottom: '14px' }}>
          <Skeleton w="180px" h={18} r={4} />
        </div>
        {[0, 1, 2].map(i => (
          <div key={i} className="settings-row">
            <Skeleton w="120px" h={12} r={3} />
            <Skeleton w="100%" h={36} r={9} style={{ maxWidth: '440px' }} />
          </div>
        ))}
      </div>
    </div>
  )
}
