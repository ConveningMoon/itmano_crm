'use client'

import { useMemo, useState, useTransition } from 'react'
import type { OpenHouseInput } from '../../open-house-actions'
import { OPEN_HOUSE_LANGUAGES, MAX_OPEN_HOUSE_LANGUAGES, type AudienceMatch, type OpenHouseLanguage } from '@/lib/open-houses/model'
import { BTN_GHOST, BTN_PRIMARY, ERROR, HINT, INPUT, LABEL, LANG_LABEL, WARN } from './ui'

// Formulario de un open house: fecha y franja, idiomas de los correos,
// audiencia por etiquetas, cuándo sale el anuncio y el recordatorio. Sirve
// para crear y para editar un borrador — uno confirmado se REPROGRAMA con su
// propio flujo, porque cambiarle la hora puede exigir avisar a quien ya lo
// recibió.

export interface TagOption { id: string; name: string; color: string }

export interface OpenHouseFormValue {
  date:           string
  startTime:      string
  endTime:        string
  timezone:       string
  publicNotes:    string
  languages:      OpenHouseLanguage[]
  audienceTagIds: string[]
  audienceMatch:  AudienceMatch
  rsvpEnabled:    boolean
  announcementMode: 'on_confirm' | 'scheduled'
  announcementDate: string
  announcementTime: string
  reminderEnabled:  boolean
  reminderCustom:   boolean
  reminderDate:     string
  reminderTime:     string
}

export function toActionInput(v: OpenHouseFormValue): OpenHouseInput {
  return {
    date: v.date, startTime: v.startTime, endTime: v.endTime, timezone: v.timezone,
    publicNotes: v.publicNotes, languages: v.languages,
    audienceTagIds: v.audienceTagIds, audienceMatch: v.audienceMatch, rsvpEnabled: v.rsvpEnabled,
    announcement: v.announcementMode === 'scheduled'
      ? { mode: 'scheduled', date: v.announcementDate, time: v.announcementTime }
      : { mode: 'on_confirm' },
    reminder: v.reminderEnabled
      ? (v.reminderCustom ? { enabled: true, date: v.reminderDate, time: v.reminderTime } : { enabled: true })
      : { enabled: false },
  }
}

function timeZones(current: string): string[] {
  let all: string[] = []
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
  } catch { /* navegador sin soporte: sólo la actual */ }
  const set = new Set(all.length ? all : ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Mexico_City', 'America/Bogota', 'America/Sao_Paulo'])
  set.add(current)
  return [...set].sort()
}

export function OpenHouseForm({
  initial, tags, submitLabel, onSubmit, onCancel,
}: {
  initial:     OpenHouseFormValue
  tags:        TagOption[]
  submitLabel: string
  onSubmit:    (v: OpenHouseFormValue) => Promise<{ ok: boolean; error?: string; warnings?: string[] }>
  onCancel:    () => void
}) {
  const [v, setV] = useState<OpenHouseFormValue>(initial)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [pending, start] = useTransition()
  const zones = useMemo(() => timeZones(initial.timezone), [initial.timezone])

  const set = <K extends keyof OpenHouseFormValue>(k: K, val: OpenHouseFormValue[K]) => setV(prev => ({ ...prev, [k]: val }))

  function toggleLang(l: OpenHouseLanguage) {
    setV(prev => {
      const has = prev.languages.includes(l)
      if (has) return { ...prev, languages: prev.languages.filter(x => x !== l) }
      if (prev.languages.length >= MAX_OPEN_HOUSE_LANGUAGES) return prev
      return { ...prev, languages: [...prev.languages, l] }
    })
  }

  function toggleTag(id: string) {
    setV(prev => ({
      ...prev,
      audienceTagIds: prev.audienceTagIds.includes(id)
        ? prev.audienceTagIds.filter(x => x !== id)
        : [...prev.audienceTagIds, id],
    }))
  }

  function submit() {
    setError(null)
    setWarnings([])
    if (v.languages.length === 0) { setError('Elige al menos un idioma.'); return }
    if (v.audienceTagIds.length === 0) { setError('Elige al menos una etiqueta: el anuncio sólo se envía a leads etiquetados.'); return }
    start(async () => {
      const res = await onSubmit(v)
      if (!res.ok) { setError(res.error ?? 'No se pudo guardar.'); return }
      if (res.warnings?.length) setWarnings(res.warnings)
    })
  }

  const row: React.CSSProperties = { display: 'flex', gap: '10px', flexWrap: 'wrap' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Cuándo */}
      <div style={row}>
        <div style={{ flex: '1 1 150px' }}>
          <label style={LABEL}>Fecha</label>
          <input type="date" value={v.date} onChange={e => set('date', e.target.value)} style={INPUT} />
        </div>
        <div style={{ flex: '0 1 110px' }}>
          <label style={LABEL}>Desde</label>
          <input type="time" value={v.startTime} onChange={e => set('startTime', e.target.value)} style={INPUT} />
        </div>
        <div style={{ flex: '0 1 110px' }}>
          <label style={LABEL}>Hasta</label>
          <input type="time" value={v.endTime} onChange={e => set('endTime', e.target.value)} style={INPUT} />
        </div>
      </div>
      <div>
        <label style={LABEL}>Zona horaria del lugar</label>
        <select value={v.timezone} onChange={e => set('timezone', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
          {zones.map(z => <option key={z} value={z}>{z}</option>)}
        </select>
        <div style={{ ...HINT, marginTop: '6px' }}>La hora se escribe en esta zona en los correos y en la web, aunque el lead esté en otra.</div>
      </div>

      <div>
        <label style={LABEL}>Indicaciones públicas (opcional)</label>
        <textarea
          rows={2} maxLength={500} value={v.publicNotes} onChange={e => set('publicNotes', e.target.value)}
          placeholder="Estacionamiento en la calle, toca el timbre del portón…"
          style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }}
        />
        <div style={{ ...HINT, marginTop: '6px' }}>Se muestran en la web y en los correos como {'{{open_house_notes}}'}.</div>
      </div>

      {/* Idiomas */}
      <div>
        <label style={LABEL}>Idiomas de los correos (máx. {MAX_OPEN_HOUSE_LANGUAGES})</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {OPEN_HOUSE_LANGUAGES.map(l => {
            const on = v.languages.includes(l)
            return (
              <button key={l} type="button" onClick={() => toggleLang(l)} aria-pressed={on}
                style={{ ...BTN_GHOST, borderColor: on ? 'var(--accent-gold)' : 'var(--border-subtle)', color: on ? 'var(--accent-gold)' : 'var(--text-secondary)' }}>
                {LANG_LABEL[l]}
              </button>
            )
          })}
        </div>
        <div style={{ ...HINT, marginTop: '6px' }}>
          Cada lead recibe el correo en su idioma (el suyo si su agente lo habla; si no, inglés). Si su idioma no está aquí, no recibe nada.
        </div>
      </div>

      {/* Audiencia */}
      <div>
        <label style={LABEL}>Audiencia del anuncio</label>
        {tags.length === 0 ? (
          <div style={HINT}>Tu equipo no tiene etiquetas. Créalas en Leads para poder elegir la audiencia.</div>
        ) : (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {tags.map(t => {
              const on = v.audienceTagIds.includes(t.id)
              return (
                <button key={t.id} type="button" onClick={() => toggleTag(t.id)} aria-pressed={on}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', fontSize: '12px',
                    borderRadius: '12px', cursor: 'pointer',
                    border: `1px solid ${on ? t.color : 'var(--border-subtle)'}`,
                    background: on ? `${t.color}22` : 'transparent',
                    color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: t.color }} />
                  {t.name}
                </button>
              )
            })}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
          <span style={HINT}>Enviar a leads con</span>
          <select value={v.audienceMatch} onChange={e => set('audienceMatch', e.target.value as AudienceMatch)} style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
            <option value="any">cualquiera de estas etiquetas</option>
            <option value="all">todas estas etiquetas</option>
          </select>
        </div>
      </div>

      {/* Anuncio */}
      <div>
        <label style={LABEL}>Envío del anuncio</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="radio" checked={v.announcementMode === 'on_confirm'} onChange={() => set('announcementMode', 'on_confirm')} />
            Al confirmar el open house
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
            <input type="radio" checked={v.announcementMode === 'scheduled'} onChange={() => set('announcementMode', 'scheduled')} />
            Programarlo
          </label>
          {v.announcementMode === 'scheduled' && (
            <div style={{ ...row, paddingLeft: '24px' }}>
              <input type="date" value={v.announcementDate} onChange={e => set('announcementDate', e.target.value)} style={{ ...INPUT, flex: '1 1 150px' }} />
              <input type="time" value={v.announcementTime} onChange={e => set('announcementTime', e.target.value)} style={{ ...INPUT, flex: '0 1 110px' }} />
            </div>
          )}
        </div>
        <div style={{ ...HINT, marginTop: '6px' }}>Los envíos programados salen en la siguiente ejecución horaria (hasta una hora después).</div>
      </div>

      {/* Recordatorio */}
      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={v.reminderEnabled} onChange={e => set('reminderEnabled', e.target.checked)} />
          Recordatorio para quienes confirmen asistencia
        </label>
        {v.reminderEnabled && (
          <div style={{ paddingLeft: '24px', marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={v.reminderCustom} onChange={e => set('reminderCustom', e.target.checked)} />
              Elegir la hora (por defecto: 24 h antes; si no cabe, 3 h antes)
            </label>
            {v.reminderCustom && (
              <div style={row}>
                <input type="date" value={v.reminderDate} onChange={e => set('reminderDate', e.target.value)} style={{ ...INPUT, flex: '1 1 150px' }} />
                <input type="time" value={v.reminderTime} onChange={e => set('reminderTime', e.target.value)} style={{ ...INPUT, flex: '0 1 110px' }} />
              </div>
            )}
          </div>
        )}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-primary)', cursor: 'pointer' }}>
        <input type="checkbox" checked={v.rsvpEnabled} onChange={e => set('rsvpEnabled', e.target.checked)} />
        Permitir confirmar asistencia (RSVP) desde el correo y la web
      </label>

      {error && <div style={ERROR}>{error}</div>}
      {warnings.map(w => <div key={w} style={WARN}>{w}</div>)}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button type="button" onClick={onCancel} style={BTN_GHOST}>Cancelar</button>
        <button type="button" onClick={submit} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
          {pending ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </div>
  )
}
