import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { OpenHouseListItem } from '@/lib/data/open-houses'
import { formatOpenHouseDate, formatOpenHouseTime } from '@/lib/open-houses/format'
import { EMAIL_STATUS_LABEL, isOpenHouseLanguage, type OpenHouseLanguage } from '@/lib/open-houses/model'
import { NewOpenHouseButton } from './new-open-house-button'
import type { AgentOption, TagOption } from './open-house-form'
import { CARD, HINT, StateChip } from './ui'

// Tab "Open house" del detalle de una propiedad: la lista de sus open houses
// (próximos y pasados) y el botón para crear uno. Componente de servidor: los
// datos llegan como props desde la página.

export function OpenHouseTab({
  propertyId, openHouses, tags, agents, defaultTagIds, contentLanguages, blockedReason, defaultTimezone,
}: {
  propertyId:       string
  openHouses:       OpenHouseListItem[]
  tags:             TagOption[]
  agents:           AgentOption[]
  defaultTagIds:    string[]
  contentLanguages: string[]
  blockedReason:    string | null
  defaultTimezone:  string | null
}) {
  const defaultLanguages = contentLanguages.filter(isOpenHouseLanguage) as OpenHouseLanguage[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ ...HINT, maxWidth: '560px' }}>
          Programa un open house, avisa por correo a los leads de las etiquetas que elijas y recibe confirmaciones de
          asistencia. La cuenta regresiva aparece sola en la ficha pública de la propiedad.
        </div>
        <NewOpenHouseButton
          propertyId={propertyId}
          tags={tags}
          agents={agents}
          defaultTagIds={defaultTagIds}
          defaultLanguages={defaultLanguages}
          blockedReason={blockedReason}
          defaultTimezone={defaultTimezone}
        />
      </div>

      {openHouses.length === 0 ? (
        <div style={{ ...CARD, padding: '28px', textAlign: 'center', ...HINT }}>Esta propiedad todavía no tiene open houses.</div>
      ) : (
        <div style={{ ...CARD, overflow: 'hidden' }}>
          {openHouses.map((oh, i) => (
            <Link
              key={oh.id}
              href={`/properties/${propertyId}/open-houses/${oh.id}`}
              style={{
                display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', textDecoration: 'none',
                borderTop: i > 0 ? '1px solid var(--border-subtle)' : undefined, flexWrap: 'wrap',
              }}
            >
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {formatOpenHouseDate(oh.startsAt, oh.timezone, 'es')}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  {formatOpenHouseTime(oh.startsAt, oh.endsAt, oh.timezone, 'es')}
                </div>
              </div>
              <StateChip state={oh.displayState} />
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '150px' }}>
                {oh.announcement
                  ? `Anuncio: ${EMAIL_STATUS_LABEL[oh.announcement.status].toLowerCase()}${oh.announcement.sentCount ? ` · ${oh.announcement.sentCount} enviados` : ''}`
                  : 'Sin anuncio'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', minWidth: '90px' }}>
                {oh.rsvpYes} {oh.rsvpYes === 1 ? 'confirmado' : 'confirmados'}
              </div>
              <ChevronRight size={16} color="var(--text-muted)" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
