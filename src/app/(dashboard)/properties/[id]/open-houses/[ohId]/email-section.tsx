'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Pencil, X } from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { EmailComposer, composerValueFrom, composerValueToInput, type ComposerValue } from '@/components/dashboard/email-composer'
import { parseEmailContent } from '@/lib/email-content'
import { OPEN_HOUSE_MERGE_TAGS } from '@/lib/open-houses/format'
import { KIND_AUDIENCE_LABEL, KIND_LABEL, type OpenHouseEmailKind } from '@/lib/open-houses/model'
import { utcToZonedWallTime } from '@/lib/open-houses/schedule'
import type { OpenHouseEmail, OpenHouseEmailContent, OpenHouseRow } from '@/lib/data/open-houses'
import type { EmailAiPurpose } from '@/app/(dashboard)/emails/ai-actions'
import type { Language } from '@/lib/types'
import { saveOpenHouseEmailContent, setOpenHouseEmailSchedule, setOpenHouseReminder } from '../../../open-house-actions'
import { BTN_GHOST, BTN_PRIMARY, CARD, EmailStatusChip, ERROR, HINT, INPUT, LABEL, LANG_LABEL, WARN } from '../ui'

const AI_PURPOSE: Record<OpenHouseEmailKind, EmailAiPurpose> = {
  announcement: 'open_house_announcement',
  reminder:     'open_house_reminder',
  update:       'open_house_update',
  cancellation: 'open_house_cancellation',
}

function contentState(c: OpenHouseEmailContent | undefined): 'crm' | 'template' | 'empty' {
  if (!c) return 'empty'
  if (c.subject?.trim() && parseEmailContent(c.bodyJson)) return 'crm'
  if (c.resendTemplateId?.trim()) return 'template'
  return 'empty'
}

function formatWhen(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('es-419', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

// ── Modal de contenido de un idioma ─────────────────────────────────────────

function ContentModal({
  email, language, openHouseId, previewAgentId, onClose,
}: {
  email: OpenHouseEmail
  language: string
  openHouseId: string
  previewAgentId: string | null
  onClose: () => void
}) {
  const router = useRouter()
  const current = email.contents.find(c => c.language === language)
  const [advanced, setAdvanced] = useState(contentState(current) === 'template')
  const [composer, setComposer] = useState<ComposerValue>(() => composerValueFrom(current?.subject ?? null, current?.bodyJson))
  const [templateId, setTemplateId] = useState(current?.resendTemplateId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    start(async () => {
      let res
      if (advanced) {
        res = await saveOpenHouseEmailContent(email.id, language, { mode: 'template', resendTemplateId: templateId })
      } else {
        const input = composerValueToInput(composer)
        if (!input.ok) { setError(input.error); return }
        res = await saveOpenHouseEmailContent(email.id, language, { mode: 'crm', subject: input.subject, content: input.content })
      }
      if (!res.ok) { setError(res.error); return }
      onClose()
      router.refresh()
    })
  }

  return (
    <ModalShell open onClose={onClose} maxWidth={680}>
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>
            {KIND_LABEL[email.kind]} · {LANG_LABEL[language] ?? language}
          </span>
          <button onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ ...HINT, marginBottom: '18px' }}>
          Usa las variables del evento en vez de escribir la fecha o la dirección a mano: si reprogramas, el correo sigue siendo correcto.
        </div>

        {!advanced ? (
          <EmailComposer
            value={composer}
            onChange={setComposer}
            locale={language as Language}
            ai={{ purpose: AI_PURPOSE[email.kind], language: language as Language }}
            mergeTags={OPEN_HOUSE_MERGE_TAGS}
            previewContext={{ openHouseId, openHouseKind: email.kind, ...(previewAgentId ? { agentId: previewAgentId } : {}) }}
          />
        ) : (
          <div>
            <label style={LABEL}>Resend Template ID</label>
            <input value={templateId} onChange={e => setTemplateId(e.target.value)} placeholder="resend_template_id" style={{ ...INPUT, fontFamily: 'monospace' }} />
            <div style={{ ...HINT, marginTop: '6px' }}>
              El template recibe como variables: customer_name, agent_name, property_name, property_address, open_house_date,
              open_house_time, open_house_notes, property_url, rsvp_url, calendar_url y unsubscribe_url. Al guardarlo se descarta
              el contenido creado en el CRM para este idioma.
            </div>
          </div>
        )}

        {error && <div style={{ ...ERROR, marginTop: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => setAdvanced(a => !a)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
            {advanced ? '← Crear contenido en el CRM' : 'Usar template de Resend (avanzado)'}
          </button>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={onClose} style={BTN_GHOST}>Cancelar</button>
            <button onClick={save} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>{pending ? 'Guardando…' : 'Guardar'}</button>
          </div>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Horario de un correo ────────────────────────────────────────────────────

function ScheduleEditor({ email, openHouse, onDone }: { email: OpenHouseEmail; openHouse: OpenHouseRow; onDone: () => void }) {
  const router = useRouter()
  const initial = utcToZonedWallTime(email.scheduledAt, openHouse.timezone)
  const onConfirmNow = openHouse.status === 'draft' && email.kind === 'announcement' && email.due
  const [mode, setMode] = useState<'on_confirm' | 'scheduled'>(onConfirmNow ? 'on_confirm' : 'scheduled')
  const [date, setDate] = useState(initial.date)
  const [time, setTime] = useState(initial.time)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [pending, start] = useTransition()
  const canOnConfirm = openHouse.status === 'draft' && email.kind === 'announcement'

  function save() {
    setError(null); setWarnings([])
    start(async () => {
      const res = await setOpenHouseEmailSchedule(email.id, mode === 'on_confirm' ? { mode } : { mode, date, time })
      if (!res.ok) { setError(res.error); return }
      if (res.warnings.length) { setWarnings(res.warnings); router.refresh(); return }
      router.refresh()
      onDone()
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg-elevated)', borderRadius: '8px' }}>
      {canOnConfirm && (
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="radio" checked={mode === 'on_confirm'} onChange={() => setMode('on_confirm')} /> Al confirmar
          </label>
          <label style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input type="radio" checked={mode === 'scheduled'} onChange={() => setMode('scheduled')} /> Programar
          </label>
        </div>
      )}
      {mode === 'scheduled' && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...INPUT, flex: '1 1 140px' }} />
          <input type="time" value={time} onChange={e => setTime(e.target.value)} style={{ ...INPUT, flex: '0 1 110px' }} />
        </div>
      )}
      <div style={HINT}>Hora en {openHouse.timezone}.</div>
      {error && <div style={ERROR}>{error}</div>}
      {warnings.map(w => <div key={w} style={WARN}>{w}</div>)}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button onClick={onDone} style={BTN_GHOST}>Cerrar</button>
        <button onClick={save} disabled={pending} style={{ ...BTN_PRIMARY, padding: '6px 14px', fontSize: '12px', opacity: pending ? 0.6 : 1 }}>{pending ? 'Guardando…' : 'Guardar horario'}</button>
      </div>
    </div>
  )
}

// ── Tarjeta de un correo ────────────────────────────────────────────────────

function EmailCard({
  email, openHouse, canManage, previewAgentId,
}: {
  email: OpenHouseEmail
  openHouse: OpenHouseRow
  canManage: boolean
  previewAgentId: string | null
}) {
  const [editingLang, setEditingLang] = useState<string | null>(null)
  const [editingSchedule, setEditingSchedule] = useState(false)
  const editable = canManage && email.status === 'pending' && openHouse.status !== 'cancelled' && openHouse.displayState !== 'finished'
  const onConfirm = openHouse.status === 'draft' && email.kind === 'announcement' && email.due

  return (
    <div style={{ ...CARD, padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{KIND_LABEL[email.kind]}</span>
        <EmailStatusChip status={email.status} />
        <span style={{ ...HINT, flex: 1 }}>{KIND_AUDIENCE_LABEL[email.kind]}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' }}>
        <span>
          {email.status === 'sent' && email.finishedAt
            ? `Enviado el ${formatWhen(email.finishedAt, openHouse.timezone)}`
            : onConfirm ? 'Sale al confirmar el open house' : `Programado para ${formatWhen(email.scheduledAt, openHouse.timezone)}`}
        </span>
        {editable && (email.kind === 'announcement' || email.kind === 'reminder') && !editingSchedule && (
          <button onClick={() => setEditingSchedule(true)} style={{ ...BTN_GHOST, padding: '3px 10px', fontSize: '11px' }}>Cambiar horario</button>
        )}
      </div>
      {editingSchedule && <ScheduleEditor email={email} openHouse={openHouse} onDone={() => setEditingSchedule(false)} />}

      {(email.status === 'sent' || email.status === 'sending' || email.recipientsFrozenAt) && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
          <span style={{ color: 'var(--accent-green)' }}>{email.sentCount} enviados</span>
          <span style={{ color: 'var(--text-muted)' }}>{email.skippedCount} omitidos</span>
          {email.failedCount > 0 && <span style={{ color: 'var(--accent-coral)' }}>{email.failedCount} fallidos</span>}
        </div>
      )}
      {email.lastError && email.status !== 'sent' && <div style={email.status === 'failed' ? ERROR : WARN}>{email.lastError}</div>}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {openHouse.languages.map(lang => {
          const state = contentState(email.contents.find(c => c.language === lang))
          return (
            <div key={lang} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{LANG_LABEL[lang] ?? lang}</span>
              {state === 'empty'
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: 'var(--accent-coral)' }}><AlertTriangle size={10} /> Sin contenido</span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: state === 'crm' ? 'var(--accent-green)' : 'var(--accent-blue)' }}><Check size={10} /> {state === 'crm' ? 'Listo' : 'Template'}</span>}
              {editable && (
                <button onClick={() => setEditingLang(lang)} aria-label={`Editar ${LANG_LABEL[lang] ?? lang}`}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', borderRadius: '6px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <Pencil size={10} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {editingLang && (
        <ContentModal email={email} language={editingLang} openHouseId={openHouse.id} previewAgentId={previewAgentId} onClose={() => setEditingLang(null)} />
      )}
    </div>
  )
}

export function EmailSection({
  emails, openHouse, canManage, previewAgentId,
}: {
  emails: OpenHouseEmail[]
  openHouse: OpenHouseRow
  canManage: boolean
  previewAgentId: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const reminder = emails.find(e => e.kind === 'reminder')
  const reminderActive = !!reminder && reminder.status !== 'cancelled'
  const canToggleReminder = canManage && openHouse.status !== 'cancelled' && openHouse.displayState !== 'finished'
    && (!reminder || reminder.status === 'pending' || reminder.status === 'cancelled')
  const shown = emails.filter(e => !(e.kind === 'reminder' && e.status === 'cancelled' && openHouse.status !== 'cancelled'))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>Correos</h2>
        {canToggleReminder && (
          <button
            disabled={pending}
            onClick={() => { setError(null); start(async () => {
              const res = await setOpenHouseReminder(openHouse.id, !reminderActive)
              if (!res.ok) setError(res.error); else router.refresh()
            }) }}
            style={BTN_GHOST}
          >
            {reminderActive ? 'Quitar recordatorio' : 'Agregar recordatorio'}
          </button>
        )}
      </div>
      {error && <div style={ERROR}>{error}</div>}
      {shown.map(e => (
        <EmailCard key={e.id} email={e} openHouse={openHouse} canManage={canManage} previewAgentId={previewAgentId} />
      ))}
    </div>
  )
}
