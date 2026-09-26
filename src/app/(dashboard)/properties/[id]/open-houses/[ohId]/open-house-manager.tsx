'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Pencil, Trash2, XCircle } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import type { OpenHouseDetail } from '@/lib/data/open-houses'
import { formatOpenHouseDate, formatOpenHouseTime } from '@/lib/open-houses/format'
import { defaultOpenHouseCopy } from '@/lib/open-houses/default-copy'
import { utcToZonedWallTime } from '@/lib/open-houses/schedule'
import { timeZoneLabel } from '@/lib/time-zones'
import type { OpenHouseLanguage } from '@/lib/open-houses/model'
import {
  cancelOpenHouse, deleteOpenHouseDraft, rescheduleOpenHouse, updateOpenHouseDetails, updateOpenHouseDraft,
} from '../../../open-house-actions'
import { OpenHouseForm, SenderSelect, toActionInput, type AgentOption, type OpenHouseFormValue } from '../open-house-form'
import { BTN_DANGER, BTN_GHOST, BTN_PRIMARY, CARD, ERROR, HINT, INPUT, LABEL, LANG_LABEL, StateChip } from '../ui'
import { EmailSection } from './email-section'
import { ConfirmPanel } from './confirm-panel'
import { RsvpSection } from './rsvp-section'
import { WebSection } from './web-section'

type NoticeKind = 'update' | 'cancellation'
type NoticeDraft = Record<string, { subject: string; body: string }>

function defaultNotice(kind: NoticeKind, languages: string[]): NoticeDraft {
  return Object.fromEntries(languages.map(l => {
    const c = defaultOpenHouseCopy(kind, l as OpenHouseLanguage)
    return [l, { subject: c.subject, body: c.body }]
  }))
}

function noticePayload(draft: NoticeDraft) {
  return Object.fromEntries(Object.entries(draft).map(([l, d]) => [l, { subject: d.subject, content: { v: 1 as const, body: d.body } }]))
}

// Editor del aviso de cambio o cancelación: un asunto y un mensaje por idioma,
// precargados con el texto por defecto. Usa las mismas variables del evento.
function NoticeEditor({ draft, onChange }: { draft: NoticeDraft; onChange: (d: NoticeDraft) => void }) {
  const langs = Object.keys(draft)
  const [lang, setLang] = useState(langs[0])
  const d = draft[lang]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {langs.length > 1 && (
        <div style={{ display: 'flex', gap: '6px' }}>
          {langs.map(l => (
            <button key={l} type="button" onClick={() => setLang(l)}
              style={{ ...BTN_GHOST, padding: '4px 10px', borderColor: l === lang ? 'var(--accent-gold)' : 'var(--border-subtle)', color: l === lang ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>
              {LANG_LABEL[l] ?? l}
            </button>
          ))}
        </div>
      )}
      <div>
        <label style={LABEL}>Asunto</label>
        <input value={d.subject} maxLength={200} onChange={e => onChange({ ...draft, [lang]: { ...d, subject: e.target.value } })} style={INPUT} />
      </div>
      <div>
        <label style={LABEL}>Mensaje</label>
        <textarea rows={8} maxLength={8000} value={d.body} onChange={e => onChange({ ...draft, [lang]: { ...d, body: e.target.value } })}
          style={{ ...INPUT, resize: 'vertical', lineHeight: 1.6 }} />
        <div style={{ ...HINT, marginTop: '6px' }}>
          Puedes usar {'{{customer_name}}'}, {'{{property_name}}'}, {'{{open_house_date}}'}, {'{{open_house_time}}'}, {'{{rsvp_url}}'} y {'{{calendar_url}}'}.
          La firma del agente y el enlace de baja se agregan solos.
        </div>
      </div>
    </div>
  )
}

export function OpenHouseManager({
  detail, canManage, senderError, integrationPrompt, publicUrl, localPreviewUrl, previewAgentId, agents,
}: {
  detail:            OpenHouseDetail
  canManage:         boolean
  senderError:       string | null
  integrationPrompt: string
  publicUrl:         string | null
  localPreviewUrl:   string | null
  previewAgentId:    string | null
  agents:            AgentOption[]
}) {
  const router = useRouter()
  const { openHouse: oh, emails, rsvps, tags } = detail
  const [modal, setModal] = useState<'edit' | 'reschedule' | 'cancel' | 'details' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  const announcement = emails.find(e => e.kind === 'announcement')
  const announcementSent = announcement?.status === 'sent'
  const isDraft = oh.status === 'draft'
  const isLive  = oh.displayState === 'scheduled'
  const eventStarted = oh.hasStarted
  const sendsOnConfirm = !!announcement && announcement.due

  // Valores del formulario de borrador a partir de lo guardado.
  const start0 = utcToZonedWallTime(oh.startsAt, oh.timezone)
  const end0   = utcToZonedWallTime(oh.endsAt, oh.timezone)
  const annWall = announcement ? utcToZonedWallTime(announcement.scheduledAt, oh.timezone) : { date: '', time: '09:00' }
  const reminder = emails.find(e => e.kind === 'reminder')
  const remWall  = reminder ? utcToZonedWallTime(reminder.scheduledAt, oh.timezone) : { date: '', time: '10:00' }
  const formInitial: OpenHouseFormValue = {
    date: start0.date, startTime: start0.time, endTime: end0.time, timezone: oh.timezone,
    publicNotes: oh.publicNotes ?? '', languages: oh.languages as OpenHouseLanguage[],
    audienceTagIds: oh.audienceTagIds, audienceMatch: oh.audienceMatch, rsvpEnabled: oh.rsvpEnabled,
    senderAgentId: oh.senderAgentId ?? '',
    announcementMode: sendsOnConfirm ? 'on_confirm' : 'scheduled', announcementDate: annWall.date, announcementTime: annWall.time,
    reminderEnabled: !!reminder, reminderCustom: !!reminder, reminderDate: remWall.date, reminderTime: remWall.time,
  }

  // Reprogramar
  const [rs, setRs] = useState({ date: start0.date, startTime: start0.time, endTime: end0.time, timezone: oh.timezone })
  const [notice, setNotice] = useState<NoticeDraft>(() => defaultNotice('update', oh.languages))
  // Cancelar
  const [reason, setReason] = useState('')
  const [cancelNotice, setCancelNotice] = useState<NoticeDraft>(() => defaultNotice('cancellation', oh.languages))
  // Detalles públicos
  const [notes, setNotes] = useState(oh.publicNotes ?? '')
  const [rsvpOn, setRsvpOn] = useState(oh.rsvpEnabled)
  const [senderId, setSenderId] = useState(oh.senderAgentId ?? '')
  const senderName = oh.senderAgentId
    ? (agents.find(a => a.id === oh.senderAgentId)?.name ?? 'Agente inactivo')
    : 'el agente de cada lead'

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) { setError(res.error ?? 'No se pudo completar.'); return }
      setModal(null)
      after?.()
      router.refresh()
    })
  }

  const audienceTags = tags.filter(t => oh.audienceTagIds.includes(t.id))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>
              Open house · {formatOpenHouseDate(oh.startsAt, oh.timezone, 'es')}
            </h1>
            <StateChip state={oh.displayState} />
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {formatOpenHouseTime(oh.startsAt, oh.endsAt, oh.timezone, 'es')} · {detail.property.name ?? detail.property.address}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px', alignItems: 'center' }}>
            <span style={HINT}>Audiencia ({oh.audienceMatch === 'all' ? 'todas' : 'cualquiera'}):</span>
            {audienceTags.length ? audienceTags.map(t => (
              <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '2px 8px', borderRadius: '10px', border: `1px solid ${t.color}66`, color: 'var(--text-secondary)' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: t.color }} />{t.name}
              </span>
            )) : <span style={HINT}>ninguna</span>}
            <span style={HINT}>· Idiomas: {oh.languages.map(l => LANG_LABEL[l] ?? l).join(', ')}</span>
            <span style={HINT}>· Remitente: {senderName}</span>
          </div>
          {oh.publicNotes && <div style={{ ...HINT, marginTop: '8px' }}>“{oh.publicNotes}”</div>}
          {oh.status === 'cancelled' && oh.cancelReason && <div style={{ ...HINT, marginTop: '8px' }}>Motivo de cancelación: {oh.cancelReason}</div>}
        </div>

        {canManage && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {isDraft && (
              <>
                <button onClick={() => setModal('edit')} style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Pencil size={13} /> Editar</button>
                <button
                  disabled={pending}
                  onClick={() => { if (window.confirm('¿Eliminar este borrador? No se envió nada.')) run(() => deleteOpenHouseDraft(oh.id), () => router.push(`/properties/${oh.propertyId}?tab=openhouse`)) }}
                  style={{ ...BTN_DANGER, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                ><Trash2 size={13} /> Eliminar</button>
              </>
            )}
            {isLive && (
              <>
                <button onClick={() => setModal('details')} style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><Pencil size={13} /> Detalles</button>
                <button onClick={() => setModal('reschedule')} style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><CalendarClock size={13} /> Reprogramar</button>
                <button onClick={() => setModal('cancel')} style={{ ...BTN_DANGER, display: 'inline-flex', alignItems: 'center', gap: '6px' }}><XCircle size={13} /> Cancelar</button>
              </>
            )}
          </div>
        )}
      </div>

      {error && !modal && <div style={ERROR}>{error}</div>}

      {isDraft && canManage && (
        <ConfirmPanel openHouseId={oh.id} sendsOnConfirm={sendsOnConfirm} disabledReason={senderError} />
      )}
      {!isDraft && senderError && oh.status !== 'cancelled' && (
        <div style={{ ...CARD, padding: '14px', ...ERROR }}>{senderError} Los correos pendientes no saldrán hasta que se resuelva.</div>
      )}

      <EmailSection emails={emails} openHouse={oh} canManage={canManage} previewAgentId={previewAgentId} />

      {!isDraft && <RsvpSection rsvps={rsvps} eventStarted={eventStarted} />}

      <WebSection isPublic={!isDraft} publicUrl={publicUrl} localPreviewUrl={localPreviewUrl} integrationPrompt={integrationPrompt} />

      {/* ── Modales ── */}
      <ModalShell open={modal === 'edit'} onClose={() => setModal(null)} maxWidth={620}>
        <div style={{ padding: '24px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '18px' }}>Editar borrador</div>
          <OpenHouseForm
            initial={formInitial}
            tags={tags}
            agents={agents}
            submitLabel="Guardar cambios"
            onCancel={() => setModal(null)}
            onSubmit={async v => {
              const res = await updateOpenHouseDraft(oh.id, toActionInput(v))
              if (res.ok && res.warnings.length === 0) { setModal(null); router.refresh() }
              else if (res.ok) router.refresh()
              return res
            }}
          />
        </div>
      </ModalShell>

      <ModalShell open={modal === 'details'} onClose={() => setModal(null)} maxWidth={520}>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Detalles</div>
          <div style={HINT}>Estos cambios se ven en la web y en los próximos correos, pero no generan un aviso.</div>
          <div>
            <label style={LABEL}>Indicaciones públicas</label>
            <textarea rows={3} maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)' }}>
            <input type="checkbox" checked={rsvpOn} onChange={e => setRsvpOn(e.target.checked)} /> Recibir confirmaciones de asistencia
          </label>
          <div>
            <label style={LABEL}>Enviar los correos a nombre de</label>
            <SenderSelect agents={agents} value={senderId} onChange={setSenderId} />
            <div style={{ ...HINT, marginTop: '6px' }}>Aplica a los correos que todavía no salieron.</div>
          </div>
          {error && <div style={ERROR}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={() => setModal(null)} style={BTN_GHOST}>Cancelar</button>
            <button disabled={pending} onClick={() => run(() => updateOpenHouseDetails(oh.id, { publicNotes: notes, rsvpEnabled: rsvpOn, senderAgentId: senderId || null }))} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>Guardar</button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={modal === 'reschedule'} onClose={() => setModal(null)} maxWidth={640}>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Reprogramar open house</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 150px' }}><label style={LABEL}>Fecha</label><input type="date" value={rs.date} onChange={e => setRs({ ...rs, date: e.target.value })} style={INPUT} /></div>
            <div style={{ flex: '0 1 110px' }}><label style={LABEL}>Desde</label><input type="time" value={rs.startTime} onChange={e => setRs({ ...rs, startTime: e.target.value })} style={INPUT} /></div>
            <div style={{ flex: '0 1 110px' }}><label style={LABEL}>Hasta</label><input type="time" value={rs.endTime} onChange={e => setRs({ ...rs, endTime: e.target.value })} style={INPUT} /></div>
          </div>
          <div style={HINT}>Zona horaria: {timeZoneLabel(rs.timezone)}</div>
          {announcementSent ? (
            <>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                El anuncio ya salió, así que se enviará este aviso a quienes lo recibieron o respondieron. El recordatorio pendiente se mueve con el evento.
              </div>
              <NoticeEditor draft={notice} onChange={setNotice} />
            </>
          ) : (
            <div style={HINT}>El anuncio todavía no salió: saldrá con la fecha nueva y no hace falta avisar a nadie.</div>
          )}
          {error && <div style={ERROR}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={() => setModal(null)} style={BTN_GHOST}>Volver</button>
            <button
              disabled={pending}
              onClick={() => run(() => rescheduleOpenHouse(oh.id, { ...rs, notice: announcementSent ? noticePayload(notice) : undefined }))}
              style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}
            >
              {pending ? 'Guardando…' : announcementSent ? 'Reprogramar y avisar' : 'Reprogramar'}
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell open={modal === 'cancel'} onClose={() => setModal(null)} maxWidth={640}>
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Cancelar open house</div>
          <div>
            <label style={LABEL}>Motivo (interno, opcional)</label>
            <input value={reason} maxLength={300} onChange={e => setReason(e.target.value)} style={INPUT} />
          </div>
          {announcementSent ? (
            <>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
                El anuncio ya salió: se enviará este aviso de cancelación a quienes lo recibieron o confirmaron. Los correos pendientes se cancelan.
              </div>
              <NoticeEditor draft={cancelNotice} onChange={setCancelNotice} />
            </>
          ) : (
            <div style={HINT}>El anuncio todavía no salió: se cancela sin enviar nada.</div>
          )}
          <div style={HINT}>La web mostrará “Este open house fue cancelado” hasta la fecha original.</div>
          {error && <div style={ERROR}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button onClick={() => setModal(null)} style={BTN_GHOST}>Volver</button>
            <button
              disabled={pending}
              onClick={() => run(() => cancelOpenHouse(oh.id, { reason, notice: announcementSent ? noticePayload(cancelNotice) : undefined }))}
              style={{ ...BTN_PRIMARY, background: 'var(--accent-coral)', opacity: pending ? 0.6 : 1 }}
            >
              {pending ? 'Cancelando…' : announcementSent ? 'Cancelar y avisar' : 'Cancelar open house'}
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  )
}
