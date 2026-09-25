'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { createOpenHouse } from '../../open-house-actions'
import { OpenHouseForm, toActionInput, type OpenHouseFormValue, type TagOption } from './open-house-form'
import { BTN_PRIMARY, HINT } from './ui'
import type { OpenHouseLanguage } from '@/lib/open-houses/model'

function nextSaturday(): string {
  const d = new Date()
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function NewOpenHouseButton({
  propertyId, tags, defaultTagIds, defaultLanguages, blockedReason, defaultTimezone,
}: {
  propertyId:       string
  tags:             TagOption[]
  defaultTagIds:    string[]
  defaultLanguages: OpenHouseLanguage[]
  /** Si el tenant no puede hacer open houses, por qué (dominio propio). */
  blockedReason:    string | null
  /** Zona del último open house del equipo; si no hay, la del navegador. */
  defaultTimezone:  string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const initial: OpenHouseFormValue = {
    date: nextSaturday(), startTime: '11:00', endTime: '14:00',
    timezone: defaultTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/New_York',
    publicNotes: '',
    languages: defaultLanguages.length ? defaultLanguages : ['es'],
    audienceTagIds: defaultTagIds, audienceMatch: 'any', rsvpEnabled: true,
    announcementMode: 'on_confirm', announcementDate: '', announcementTime: '09:00',
    reminderEnabled: true, reminderCustom: false, reminderDate: '', reminderTime: '10:00',
  }

  if (blockedReason) {
    return (
      <div style={{ ...HINT, maxWidth: '560px' }}>
        {blockedReason}
      </div>
    )
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ ...BTN_PRIMARY, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <CalendarPlus size={14} /> Nuevo open house
      </button>
      <ModalShell open={open} onClose={() => setOpen(false)} maxWidth={620}>
        <div style={{ padding: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>Nuevo open house</div>
          <div style={{ ...HINT, marginBottom: '18px' }}>
            Se crea como borrador: no se publica ni envía nada hasta que lo confirmes.
          </div>
          <OpenHouseForm
            initial={initial}
            tags={tags}
            submitLabel="Crear borrador"
            onCancel={() => setOpen(false)}
            onSubmit={async v => {
              const res = await createOpenHouse(propertyId, toActionInput(v))
              if (!res.ok) return res
              setOpen(false)
              router.push(`/properties/${propertyId}/open-houses/${res.id}`)
              return res
            }}
          />
        </div>
      </ModalShell>
    </>
  )
}
