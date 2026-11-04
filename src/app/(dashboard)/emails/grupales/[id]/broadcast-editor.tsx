'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Pencil, Search, X } from 'lucide-react'
import {
  BTN_DANGER, BTN_GHOST, BTN_PRIMARY, CARD, ERROR, HINT, INPUT, LABEL, LANG_LABEL, WARN,
} from '@/app/(dashboard)/properties/[id]/open-houses/ui'
import { ModalShell } from '@/components/motion/modal-shell'
import { EmailComposer, composerValueFrom, composerValueToInput, type ComposerValue } from '@/components/dashboard/email-composer'
import { RefreshingPill } from '@/components/ui/loading-indicator'
import { EMPTY_SEGMENT, hasAudienceCriteria, type BroadcastAudience, type SegmentAudience } from '@/lib/broadcasts/audience'
import { BROADCAST_LANGUAGES, MAX_BROADCAST_RECIPIENTS } from '@/lib/broadcasts/model'
import type { BroadcastContent, BroadcastDetail } from '@/lib/data/email-broadcasts'
import { QUALITY_BANDS, QUALITY_CONFIG, STAGES, STAGE_CONFIG } from '@/lib/scoring/priority'
import type { BroadcastAudiencePreview } from '@/lib/services/broadcast-audience'
import type { Language } from '@/lib/types'
import {
  confirmBroadcast, deleteBroadcast, previewBroadcastAudience, saveBroadcast, saveBroadcastContent,
  savePostalAddress, searchLeadsForBroadcast, sendBroadcastTest,
} from '../../broadcast-actions'
import { SKIP_REASON_TEXT } from './labels'

interface Option { id: string; name: string }

const SECTION: React.CSSProperties = { ...CARD, padding: '20px', marginBottom: '16px' }
const TITLE: React.CSSProperties = { fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '5px 12px', fontSize: '12px', borderRadius: '999px', cursor: 'pointer',
        color: active ? 'var(--accent-gold)' : 'var(--text-secondary)',
        background: active ? 'rgba(201,169,110,0.1)' : 'transparent',
        border: `1px solid ${active ? 'rgba(201,169,110,0.35)' : 'var(--border-subtle)'}`,
      }}
    >
      {children}
    </button>
  )
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

function SelectField({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div style={{ flex: '1 1 160px', minWidth: 0 }}>
      <label style={LABEL}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={INPUT}>
        <option value="all">Todos</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  )
}

// ── Audiencia por filtros ────────────────────────────────────────────────────

function SegmentFields({ audience, onChange, tags, agents, channels, restrictedToOwnLeads }: {
  audience: SegmentAudience
  onChange: (a: SegmentAudience) => void
  tags: Option[]
  agents: Option[]
  channels: Option[]
  restrictedToOwnLeads: boolean
}) {
  const set = (patch: Partial<SegmentAudience>) => onChange({ ...audience, ...patch })
  return (
    <>
      {tags.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
            <span style={LABEL}>Etiquetas</span>
            {audience.tagIds.length > 1 && (
              <div className="segmented" role="group" aria-label="Cómo combinar las etiquetas" style={{ marginBottom: '6px' }}>
                <button type="button" onClick={() => set({ tagMatch: 'any' })} aria-pressed={audience.tagMatch === 'any'}>Cualquiera</button>
                <button type="button" onClick={() => set({ tagMatch: 'all' })} aria-pressed={audience.tagMatch === 'all'}>Todas</button>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {tags.map(t => (
              <Chip key={t.id} active={audience.tagIds.includes(t.id)} onClick={() => set({ tagIds: toggle(audience.tagIds, t.id) })}>{t.name}</Chip>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: '14px' }}>
        <span style={LABEL}>Etapa</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {STAGES.map(s => (
            <Chip key={s} active={audience.stages.includes(s)} onClick={() => set({ stages: toggle(audience.stages, s) })}>{STAGE_CONFIG[s].label}</Chip>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        {!restrictedToOwnLeads && (
          <SelectField label="Agente" value={audience.agentId} onChange={agentId => set({ agentId })} options={agents.map(a => ({ value: a.id, label: a.name }))} />
        )}
        <SelectField label="Fuente" value={audience.channelId} onChange={channelId => set({ channelId })} options={channels.map(c => ({ value: c.id, label: c.name }))} />
        <SelectField label="Idioma del lead" value={audience.language} onChange={language => set({ language })} options={BROADCAST_LANGUAGES.map(l => ({ value: l, label: LANG_LABEL[l] }))} />
        <SelectField label="Calidad" value={audience.quality} onChange={quality => set({ quality })} options={QUALITY_BANDS.map(q => ({ value: q, label: QUALITY_CONFIG[q].label }))} />
      </div>

      {(audience.q !== '' || audience.source !== 'all') && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px', alignItems: 'center' }}>
          <span style={HINT}>Filtros traídos de Leads:</span>
          {audience.q !== '' && <Chip active onClick={() => set({ q: '' })}>Búsqueda: {audience.q} <X size={11} style={{ verticalAlign: '-1px' }} /></Chip>}
          {audience.source !== 'all' && <Chip active onClick={() => set({ source: 'all' })}>Tipo de fuente: {audience.source} <X size={11} style={{ verticalAlign: '-1px' }} /></Chip>}
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
        <input type="checkbox" checked={audience.excludeImported} onChange={e => set({ excludeImported: e.target.checked })} />
        Excluir leads importados de otro CRM
      </label>
    </>
  )
}

// ── Búsqueda para la selección manual ────────────────────────────────────────

function ManualSearch({ selected, onAdd }: { selected: readonly string[]; onAdd: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; email: string | null }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  useEffect(() => {
    if (query.trim().length < 2) return
    const t = setTimeout(() => start(async () => {
      const res = await searchLeadsForBroadcast(query)
      if (res.ok) { setResults(res.leads); setError(null) } else setError(res.error)
    }), 300)
    return () => clearTimeout(t)
  }, [query])

  const visible = query.trim().length < 2 ? [] : results

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <Search size={14} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--text-muted)' }} />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o email" aria-label="Buscar leads" style={{ ...INPUT, paddingLeft: '32px' }} />
      </div>
      <RefreshingPill show={pending} label="Buscando…" />
      {error && <div style={{ ...ERROR, marginTop: '8px' }}>{error}</div>}
      {visible.length > 0 && (
        <div style={{ marginTop: '8px', border: '1px solid var(--border-subtle)', borderRadius: '8px', maxHeight: '220px', overflowY: 'auto' }}>
          {visible.map(l => {
            const added = selected.includes(l.id)
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => onAdd(l.id)}
                disabled={added}
                style={{
                  display: 'flex', justifyContent: 'space-between', gap: '12px', width: '100%', padding: '8px 12px', textAlign: 'left',
                  background: 'none', border: 'none', borderBottom: '1px solid var(--border-subtle)', fontSize: '13px',
                  color: added ? 'var(--text-muted)' : 'var(--text-primary)', cursor: added ? 'default' : 'pointer',
                }}
              >
                <span>{l.name || 'Sin nombre'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{added ? 'Agregado' : l.email ?? 'Sin email'}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Contenido de un idioma ───────────────────────────────────────────────────

function ContentModal({ language, current, senderAgentId, beforeSave, broadcastId, onClose, onSaved }: {
  language: string
  current: BroadcastContent | undefined
  senderAgentId: string | null
  beforeSave: () => Promise<string | null>
  broadcastId: string
  onClose: () => void
  onSaved: (c: BroadcastContent) => void
}) {
  const [value, setValue] = useState<ComposerValue>(() => composerValueFrom(current?.subject ?? null, current?.bodyJson))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function save() {
    setError(null)
    const input = composerValueToInput(value)
    if (!input.ok) { setError(input.error); return }
    start(async () => {
      // El idioma puede estar recién marcado: se guarda primero el borrador.
      const saveError = await beforeSave()
      if (saveError) { setError(saveError); return }
      const res = await saveBroadcastContent(broadcastId, language, { subject: input.subject, content: input.content })
      if (!res.ok) { setError(res.error); return }
      onSaved({ language, subject: input.subject, bodyJson: input.content })
    })
  }

  return (
    <ModalShell open onClose={onClose} maxWidth={680}>
      <div style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Correo en {LANG_LABEL[language] ?? language}</span>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
        </div>
        <div style={{ ...HINT, marginBottom: '18px' }}>
          La firma del agente, la dirección postal y el enlace para darse de baja se agregan solos.
        </div>
        <EmailComposer
          value={value}
          onChange={setValue}
          locale={language as Language}
          ai={{ purpose: 'broadcast', language: language as Language }}
          previewContext={{ withPostalAddress: true, ...(senderAgentId ? { agentId: senderAgentId } : {}) }}
        />
        {error && <div style={{ ...ERROR, marginTop: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <button type="button" onClick={onClose} style={BTN_GHOST}>Cancelar</button>
          <button type="button" onClick={save} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>{pending ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Confirmación ─────────────────────────────────────────────────────────────

function ConfirmModal({ broadcastId, toSend, beforeConfirm, onClose }: {
  broadcastId: string
  toSend: number
  beforeConfirm: () => Promise<string | null>
  onClose: () => void
}) {
  const router = useRouter()
  const [mode, setMode] = useState<'now' | 'scheduled'>('now')
  const [at, setAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  function confirm() {
    setError(null)
    if (mode === 'scheduled' && !at) { setError('Elige la fecha y la hora.'); return }
    start(async () => {
      const saveError = await beforeConfirm()
      if (saveError) { setError(saveError); return }
      const res = await confirmBroadcast(broadcastId, {
        expectedRecipients: toSend,
        // `datetime-local` es hora del navegador; aquí se convierte a UTC.
        when: mode === 'now' ? { mode } : { mode, at: new Date(at).toISOString() },
      })
      if (!res.ok) { setError(res.error); return }
      router.refresh()
    })
  }

  return (
    <ModalShell open onClose={onClose} maxWidth={480}>
      <div style={{ padding: '24px' }}>
        <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Enviar a {toSend} {toSend === 1 ? 'lead' : 'leads'}
        </div>
        <div style={{ ...HINT, marginBottom: '16px' }}>
          Son correos reales y lo ya entregado no se puede deshacer. Lo que falte sí se puede cancelar a mitad de envío.
        </div>
        <div className="segmented" role="group" aria-label="Cuándo enviar" style={{ marginBottom: '14px' }}>
          <button type="button" onClick={() => setMode('now')} aria-pressed={mode === 'now'}>Ahora</button>
          <button type="button" onClick={() => setMode('scheduled')} aria-pressed={mode === 'scheduled'}>Programar</button>
        </div>
        {mode === 'scheduled' && (
          <div style={{ marginBottom: '14px' }}>
            <label style={LABEL}>Fecha y hora</label>
            <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} style={INPUT} />
            <div style={{ ...HINT, marginTop: '6px' }}>En la hora de tu computadora. Sale en la siguiente ejecución del envío, que corre cada hora.</div>
          </div>
        )}
        {error && <div style={{ ...ERROR, marginBottom: '12px' }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onClose} style={BTN_GHOST}>Volver</button>
          <button type="button" onClick={confirm} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
            {pending ? 'Confirmando…' : mode === 'now' ? `Enviar a ${toSend}` : 'Programar envío'}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────

export function BroadcastEditor({ broadcast, tags, agents, channels, postalAddress, canEditPostalAddress, restrictedToOwnLeads }: {
  broadcast: BroadcastDetail
  tags: Option[]
  agents: Option[]
  channels: Option[]
  postalAddress: string
  canEditPostalAddress: boolean
  restrictedToOwnLeads: boolean
}) {
  const router = useRouter()
  const [name, setName] = useState(broadcast.name)
  const [audience, setAudience] = useState<BroadcastAudience>(broadcast.audience)
  const [languages, setLanguages] = useState<string[]>(broadcast.languages)
  const [senderAgentId, setSenderAgentId] = useState<string | null>(broadcast.senderAgentId)
  const [contents, setContents] = useState<BroadcastContent[]>(broadcast.contents)

  const [preview, setPreview] = useState<BroadcastAudiencePreview | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewing, startPreview] = useTransition()
  const requestRef = useRef(0)

  const [address, setAddress] = useState(postalAddress)
  const [savedAddress, setSavedAddress] = useState(postalAddress)
  const [addressMessage, setAddressMessage] = useState<string | null>(null)
  const [savingAddress, startAddress] = useTransition()

  const [editingLanguage, setEditingLanguage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()
  const [deleting, startDelete] = useTransition()

  const criteria = hasAudienceCriteria(audience)

  // Conteo en vivo. Una respuesta vieja no pisa a una nueva.
  useEffect(() => {
    if (!criteria) return
    const request = ++requestRef.current
    const t = setTimeout(() => startPreview(async () => {
      const res = await previewBroadcastAudience(broadcast.id, audience, languages)
      if (request !== requestRef.current) return
      if (res.ok) { setPreview(res.preview); setPreviewError(null) } else setPreviewError(res.error)
    }), 400)
    return () => clearTimeout(t)
  }, [audience, languages, broadcast.id, criteria])

  async function persist(): Promise<string | null> {
    const res = await saveBroadcast(broadcast.id, { name, audience, languages: languages as never, senderAgentId })
    return res.ok ? null : res.error
  }

  function save() {
    setError(null); setNotice(null)
    startSave(async () => {
      const saveError = await persist()
      if (saveError) setError(saveError)
      else { setNotice('Borrador guardado.'); router.refresh() }
    })
  }

  function sendTest(language: string) {
    setError(null); setNotice(null)
    startTest(async () => {
      const saveError = await persist()
      if (saveError) { setError(saveError); return }
      const res = await sendBroadcastTest(broadcast.id, language)
      if (!res.ok) setError(res.error)
      else setNotice(`Prueba enviada a ${res.to}.`)
    })
  }

  function saveAddress() {
    setAddressMessage(null)
    startAddress(async () => {
      const res = await savePostalAddress(address)
      if (!res.ok) { setAddressMessage(res.error); return }
      setSavedAddress(address.trim())
      setAddressMessage('Dirección guardada.')
    })
  }

  function removeLead(id: string) {
    if (audience.mode === 'manual') setAudience({ ...audience, leadIds: audience.leadIds.filter(l => l !== id) })
    else setAudience({ ...audience, excludedLeadIds: [...audience.excludedLeadIds, id] })
  }

  function removeDraft() {
    setError(null)
    startDelete(async () => {
      const res = await deleteBroadcast(broadcast.id)
      if (!res.ok) { setError(res.error); return }
      router.push('/emails?tab=grupales')
    })
  }

  const written = new Set(contents.map(c => c.language))
  const missing = languages.filter(l => !written.has(l))
  const shownPreview = criteria ? preview : null
  const toSend = shownPreview?.summary.toSend ?? 0
  const skipped = Object.entries(shownPreview?.summary.skipped ?? {})

  const blocker =
    !criteria ? 'Elige a quién le llega este correo.'
    : !shownPreview ? 'Calculando la audiencia…'
    : shownPreview.overflow ? `La audiencia pasa del tope de ${MAX_BROADCAST_RECIPIENTS} destinatarios por envío. Acótala.`
    : toSend === 0 ? 'Nadie de esta audiencia puede recibir el correo.'
    : missing.length > 0 ? `Falta escribir el correo en: ${missing.map(l => LANG_LABEL[l] ?? l).join(', ')}.`
    : !savedAddress ? 'Falta la dirección postal del negocio.'
    : null

  return (
    <>
      {/* Nombre */}
      <div style={SECTION}>
        <label style={LABEL} htmlFor="broadcast-name">Nombre interno</label>
        <input id="broadcast-name" value={name} onChange={e => setName(e.target.value)} maxLength={120} style={INPUT} />
        <div style={{ ...HINT, marginTop: '6px' }}>Sólo lo ve tu equipo; no viaja en el correo.</div>
      </div>

      {/* Audiencia */}
      <div style={SECTION}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
          <div style={TITLE}>A quién le llega</div>
          <div className="segmented" role="group" aria-label="Forma de elegir la audiencia">
            <button type="button" onClick={() => setAudience(EMPTY_SEGMENT)} aria-pressed={audience.mode === 'segment'}>Por filtros</button>
            <button type="button" onClick={() => setAudience({ mode: 'manual', leadIds: [] })} aria-pressed={audience.mode === 'manual'}>Uno por uno</button>
          </div>
        </div>

        {audience.mode === 'segment' ? (
          <SegmentFields audience={audience} onChange={setAudience} tags={tags} agents={agents} channels={channels} restrictedToOwnLeads={restrictedToOwnLeads} />
        ) : (
          <ManualSearch
            selected={audience.leadIds}
            onAdd={id => setAudience(a => (a.mode === 'manual' && !a.leadIds.includes(id) ? { ...a, leadIds: [...a.leadIds, id] } : a))}
          />
        )}

        {restrictedToOwnLeads && <div style={{ ...HINT, marginTop: '10px' }}>Sólo se incluyen los leads que tienes asignados.</div>}

        <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '16px', paddingTop: '14px' }} aria-live="polite">
          <RefreshingPill show={previewing} label="Calculando…" />
          {previewError && <div style={ERROR}>{previewError}</div>}
          {!criteria && (
            <div style={HINT}>
              {audience.mode === 'segment'
                ? 'Elige al menos un criterio. Sin criterios no se selecciona a nadie: nunca es "todos los leads".'
                : 'Busca y agrega los leads que deben recibirlo.'}
            </div>
          )}
          {shownPreview && (
            <>
              <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                {toSend} {toSend === 1 ? 'lead lo recibe' : 'leads lo reciben'}
                {Object.entries(shownPreview.summary.byLanguage).length > 0 && (
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                    {' · '}{Object.entries(shownPreview.summary.byLanguage).map(([l, n]) => `${n} en ${LANG_LABEL[l] ?? l}`).join(', ')}
                  </span>
                )}
              </div>
              {skipped.length > 0 && (
                <ul style={{ ...HINT, margin: '6px 0 0', paddingLeft: '18px' }}>
                  {skipped.map(([reason, n]) => <li key={reason}>{n} no: {SKIP_REASON_TEXT[reason] ?? reason}</li>)}
                </ul>
              )}
              {shownPreview.overflow && <div style={{ ...ERROR, marginTop: '6px' }}>Pasa del tope de {MAX_BROADCAST_RECIPIENTS} destinatarios por envío.</div>}
              {shownPreview.imported > 0 && (
                <div style={{ ...WARN, marginTop: '6px' }}>
                  {shownPreview.imported} {shownPreview.imported === 1 ? 'viene importado' : 'vienen importados'} de otro CRM y quizá no aceptaron recibir correos tuyos. Una lista vieja es la primera causa de rebotes.
                </div>
              )}
              {audience.mode === 'segment' && audience.excludedLeadIds.length > 0 && (
                <div style={{ ...HINT, marginTop: '6px' }}>
                  {audience.excludedLeadIds.length} quitados a mano.{' '}
                  <button type="button" onClick={() => setAudience({ ...audience, excludedLeadIds: [] })} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-gold)', fontSize: '12px', cursor: 'pointer' }}>Volver a incluirlos</button>
                </div>
              )}
              {shownPreview.rows.length > 0 && (
                <details style={{ marginTop: '10px' }}>
                  <summary style={{ fontSize: '12px', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    Ver la lista{shownPreview.summary.total > shownPreview.rows.length ? ` (primeros ${shownPreview.rows.length})` : ''}
                  </summary>
                  <div style={{ marginTop: '8px', border: '1px solid var(--border-subtle)', borderRadius: '8px', maxHeight: '260px', overflowY: 'auto' }}>
                    {shownPreview.rows.map(r => (
                      <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '7px 12px', borderBottom: '1px solid var(--border-subtle)', fontSize: '12px' }}>
                        <span style={{ flex: '0 1 160px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || 'Sin nombre'}</span>
                        <span style={{ flex: 1, minWidth: 0, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.email ?? 'Sin email'}{r.reason ? ` · ${SKIP_REASON_TEXT[r.reason] ?? r.reason}` : ''}
                        </span>
                        <button type="button" onClick={() => removeLead(r.id)} aria-label={`Quitar a ${r.name || 'este lead'}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}><X size={14} /></button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </>
          )}
        </div>
      </div>

      {/* Contenido */}
      <div style={SECTION}>
        <div style={TITLE}>El correo</div>
        <div style={{ ...HINT, marginBottom: '12px' }}>
          Cada lead lo recibe en su idioma. Si su idioma no está escrito aquí, no recibe nada: mandarlo en otro idioma es peor que no mandarlo.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
          {BROADCAST_LANGUAGES.map(l => (
            <Chip
              key={l}
              active={languages.includes(l)}
              onClick={() => setLanguages(cur => (cur.includes(l) && cur.length === 1 ? cur : toggle(cur, l)))}
            >
              {LANG_LABEL[l]}
            </Chip>
          ))}
        </div>
        {languages.map(l => {
          const c = contents.find(x => x.language === l)
          return (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border-subtle)' }}>
              <span style={{ width: '84px', fontSize: '13px', color: 'var(--text-secondary)' }}>{LANG_LABEL[l] ?? l}</span>
              <span style={{ flex: '1 1 200px', minWidth: 0, fontSize: '13px', color: c ? 'var(--text-primary)' : 'var(--accent-gold)' }}>
                {c ? <><Check size={13} style={{ verticalAlign: '-2px', marginRight: '6px', color: 'var(--accent-teal)' }} />{c.subject}</> : 'Sin escribir'}
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                {c && (
                  <button type="button" onClick={() => sendTest(l)} disabled={testing} style={{ ...BTN_GHOST, opacity: testing ? 0.6 : 1 }}>
                    {testing ? 'Enviando…' : 'Enviarme una prueba'}
                  </button>
                )}
                <button type="button" onClick={() => setEditingLanguage(l)} style={{ ...BTN_GHOST, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <Pencil size={12} /> {c ? 'Editar' : 'Escribir'}
                </button>
              </div>
            </div>
          )
        })}

        <div style={{ marginTop: '14px' }}>
          <label style={LABEL} htmlFor="broadcast-sender">Remitente</label>
          <select
            id="broadcast-sender"
            value={senderAgentId ?? ''}
            onChange={e => setSenderAgentId(e.target.value || null)}
            style={INPUT}
          >
            <option value="">{restrictedToOwnLeads ? 'A mi nombre' : 'El agente de cada lead'}</option>
            {!restrictedToOwnLeads && agents.map(a => <option key={a.id} value={a.id}>{a.name} (todos los correos)</option>)}
          </select>
          <div style={{ ...HINT, marginTop: '6px' }}>Decide el nombre, la firma y a quién le llegan las respuestas.</div>
        </div>
      </div>

      {/* Dirección postal */}
      <div style={SECTION}>
        <label style={LABEL} htmlFor="broadcast-address">Dirección postal del negocio</label>
        {canEditPostalAddress ? (
          <>
            <textarea id="broadcast-address" value={address} onChange={e => setAddress(e.target.value)} maxLength={300} rows={2} style={{ ...INPUT, resize: 'vertical' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
              <span style={HINT}>La ley CAN-SPAM la exige en el pie de todo correo comercial. Es la misma para todo el equipo.</span>
              <button type="button" onClick={saveAddress} disabled={savingAddress || address.trim() === savedAddress} style={{ ...BTN_GHOST, opacity: savingAddress || address.trim() === savedAddress ? 0.6 : 1 }}>
                {savingAddress ? 'Guardando…' : 'Guardar dirección'}
              </button>
            </div>
            {addressMessage && <div style={{ ...HINT, marginTop: '6px' }}>{addressMessage}</div>}
          </>
        ) : (
          <div style={savedAddress ? { fontSize: '13px', color: 'var(--text-secondary)', whiteSpace: 'pre-line' } : WARN}>
            {savedAddress || 'Falta configurarla. Pídele al owner de tu equipo que la agregue: sin ella no se puede enviar.'}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div style={SECTION}>
        {notice && <div style={{ fontSize: '12px', color: 'var(--accent-teal)', marginBottom: '10px' }}>{notice}</div>}
        {error && <div style={{ ...ERROR, marginBottom: '10px' }}>{error}</div>}
        {blocker && <div style={{ ...HINT, marginBottom: '10px' }}>{blocker}</div>}
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
          {confirmingDelete ? (
            <button type="button" onClick={removeDraft} disabled={deleting} style={{ ...BTN_DANGER, opacity: deleting ? 0.6 : 1 }}>{deleting ? 'Borrando…' : 'Sí, borrar borrador'}</button>
          ) : (
            <button type="button" onClick={() => setConfirmingDelete(true)} style={BTN_DANGER}>Borrar</button>
          )}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={saving} style={{ ...BTN_GHOST, opacity: saving ? 0.6 : 1 }}>{saving ? 'Guardando…' : 'Guardar borrador'}</button>
            <button type="button" onClick={() => setConfirming(true)} disabled={!!blocker || previewing} style={{ ...BTN_PRIMARY, opacity: blocker || previewing ? 0.5 : 1, cursor: blocker || previewing ? 'not-allowed' : 'pointer' }}>
              Revisar y enviar
            </button>
          </div>
        </div>
      </div>

      {editingLanguage && (
        <ContentModal
          language={editingLanguage}
          current={contents.find(c => c.language === editingLanguage)}
          senderAgentId={senderAgentId}
          beforeSave={persist}
          broadcastId={broadcast.id}
          onClose={() => setEditingLanguage(null)}
          onSaved={c => {
            setContents(cur => [...cur.filter(x => x.language !== c.language), c])
            setEditingLanguage(null)
          }}
        />
      )}
      {confirming && <ConfirmModal broadcastId={broadcast.id} toSend={toSend} beforeConfirm={persist} onClose={() => setConfirming(false)} />}
    </>
  )
}
