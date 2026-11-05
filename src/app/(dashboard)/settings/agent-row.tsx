'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check } from 'lucide-react'
import type { Agent } from '@/lib/types'
import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import { updateAgent, inviteAgentAccess, revokeAgentAccess, linkAgentToMyAccount, updateAgentLanguages, setAgentAsOwner, deleteAgent, updateAgentDescription, updateAgentCoverPhoto, removeAgentCoverPhoto } from './actions'
import { RowMenu, type MenuEntry } from '@/components/ui/row-menu'
import { InfoHint } from '@/components/ui/info-hint'
import { AgentAvatar } from './agent-avatar'

const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGE_CODES.map(code => [code, LANGUAGE_CONFIG[code].label])
)

const LANGUAGE_OPTIONS = SUPPORTED_LANGUAGE_CODES.map(code => ({ value: code, label: LANGUAGE_LABELS[code] }))

// ─── Agent row ────────────────────────────────────────────────────────────────
// Una línea de la lista (avatar, nombre, idiomas, email, acceso y menú ⋯) y,
// debajo, los paneles que abre cada entrada del menú.

export function AgentRow({ agent, hasAccess, canManage, canLinkSelf, canEditSelf, isOwner, canManageOwner, canDeleteAgents }: { agent: Agent; hasAccess: boolean; canManage: boolean; canLinkSelf: boolean; canEditSelf: boolean; isOwner: boolean; canManageOwner: boolean; canDeleteAgents: boolean }) {
  const router = useRouter()
  const rowRef = useRef<HTMLDivElement>(null)
  // Control del panel que se acaba de abrir desde el menú ⋯: al cerrarse el menú
  // el foco va ahí en vez de perderse en <body>.
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const fid = (suffix: string) => `agent-${agent.id}-${suffix}`

  const [editing, setEditing]   = useState(false)
  const [name, setName]         = useState(agent.name)
  const [email, setEmail]       = useState(agent.email ?? '')
  const [phone, setPhone]       = useState(agent.phone ?? '')
  const [color, setColor]       = useState(agent.accentColor)
  const [initials, setInitials] = useState(agent.avatarInitials)
  const [error, setError]       = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Login-access UI state (invite / revoke)
  const [accessMode, setAccessMode]   = useState<'idle' | 'inviting' | 'confirmRevoke'>('idle')
  const [inviteEmail, setInviteEmail] = useState(agent.email ?? '')
  const [accessMsg, setAccessMsg]     = useState<string | null>(null)
  const [accessErr, setAccessErr]     = useState<string | null>(null)
  const [accessPending, startAccess]  = useTransition()

  // Cómo se presenta el agente. Lo escribe él; la IA lo usa para personalizar el
  // análisis y el contenido. Antes vivía en la pestaña del negocio y sólo lo
  // podía escribir el propietario — describir a otra persona en tercera persona.
  const [editingDesc, setEditingDesc] = useState(false)
  const [desc, setDesc]               = useState(agent.description ?? '')
  const [descSaved, setDescSaved]     = useState(agent.description ?? '')
  const [descErr, setDescErr]         = useState<string | null>(null)
  const [descOk, setDescOk]           = useState(false)
  const [descPending, startDesc]      = useTransition()

  // Portada del agente (095). Es su foto, así que la sube él: mismo permiso que
  // la descripción. El sistema detecta solo si el archivo trae transparencia —
  // al agente no se le pregunta por canales alfa, se le enseña el resultado.
  const [editingCover, setEditingCover] = useState(false)
  const [coverUrl, setCoverUrl]         = useState(agent.coverPhotoUrl ?? null)
  const [coverCutout, setCoverCutout]   = useState(agent.coverPhotoCutout === true)
  const [coverErr, setCoverErr]         = useState<string | null>(null)
  const [coverPending, startCover]      = useTransition()

  // Idiomas registrados (definen los emails de cierre del agente — 058).
  const [editingLangs, setEditingLangs] = useState(false)
  const [langs, setLangs]               = useState<string[]>(agent.languages)
  const [langsSaved, setLangsSaved]     = useState<string[]>(agent.languages)
  const [langErr, setLangErr]           = useState<string | null>(null)
  const [langOk, setLangOk]             = useState(false)
  const [langPending, startLangs]       = useTransition()

  // Owner / eliminación (Partner). deleteStep: doble verificación.
  const [ownerBusy, startOwner]   = useTransition()
  const [deleteStep, setDeleteStep] = useState<'idle' | 'confirm1' | 'confirm2'>('idle')
  const [confirmText, setConfirmText] = useState('')
  const [dangerErr, setDangerErr] = useState<string | null>(null)
  const [dangerBusy, startDanger] = useTransition()

  function handleMakeOwner() {
    setDangerErr(null)
    startOwner(async () => {
      const res = await setAgentAsOwner(agent.id)
      if (!res.ok) { setDangerErr(res.error); return }
      router.refresh()
    })
  }

  function handleDelete() {
    setDangerErr(null)
    startDanger(async () => {
      const res = await deleteAgent(agent.id)
      if (!res.ok) { setDangerErr(res.error); return }
      closePanel(() => setDeleteStep('idle'))
      router.refresh()
    })
  }

  function toggleLang(l: string) {
    if (l === agent.language) return // el principal (ruteo) no se desmarca
    setLangs(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l])
  }

  function handleSaveDesc() {
    setDescErr(null); setDescOk(false)
    startDesc(async () => {
      const res = await updateAgentDescription(agent.id, desc)
      if (!res.ok) { setDescErr(res.error); return }
      setDescSaved(desc)
      closePanel(() => setEditingDesc(false))
      setDescOk(true)
      setTimeout(() => setDescOk(false), 2500)
    })
  }

  function handleCoverUpload(file: File) {
    setCoverErr(null)
    const data = new FormData()
    data.set('agentId', agent.id)
    data.set('file', file)
    startCover(async () => {
      const res = await updateAgentCoverPhoto(data)
      if (!res.ok) { setCoverErr(res.error); return }
      setCoverUrl(res.url)
      setCoverCutout(res.cutout)
    })
  }

  function handleCoverRemove() {
    setCoverErr(null)
    startCover(async () => {
      const res = await removeAgentCoverPhoto(agent.id)
      if (!res.ok) { setCoverErr(res.error); return }
      setCoverUrl(null)
      setCoverCutout(false)
    })
  }

  function handleSaveLangs() {
    setLangErr(null); setLangOk(false)
    startLangs(async () => {
      const res = await updateAgentLanguages(agent.id, langs)
      if (!res.ok) { setLangErr(res.error); return }
      setLangsSaved(langs)
      closePanel(() => setEditingLangs(false))
      setLangOk(true)
      setTimeout(() => setLangOk(false), 2500)
    })
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateAgent(agent.id, { name, email, phone, accentColor: color, avatarInitials: initials })
      if (!res.ok) { setError(res.error); return }
      closePanel(() => setEditing(false))
    })
  }

  function handleInvite() {
    setAccessErr(null); setAccessMsg(null)
    startAccess(async () => {
      const res = await inviteAgentAccess(agent.id, inviteEmail)
      if (!res.ok) { setAccessErr(res.error); return }
      setAccessMsg(`Listo. ${res.email} ya puede entrar en app.itmano.com con su correo (Magic Link).`)
      closePanel(() => setAccessMode('idle'))
    })
  }

  function handleRevoke() {
    setAccessErr(null); setAccessMsg(null)
    startAccess(async () => {
      const res = await revokeAgentAccess(agent.id)
      if (!res.ok) { setAccessErr(res.error); return }
      closePanel(() => setAccessMode('idle'))
    })
  }

  function handleLinkSelf() {
    setAccessErr(null); setAccessMsg(null)
    startAccess(async () => {
      const res = await linkAgentToMyAccount(agent.id)
      if (!res.ok) { setAccessErr(res.error); return }
      setAccessMsg(`Vinculado. Ahora figuras como ${agent.name} (p. ej. para importar leads).`)
    })
  }

  // Al cerrar un panel con Cancelar/Cerrar su botón desaparece: el foco vuelve al ⋯.
  function closePanel(close: () => void) {
    close()
    rowRef.current?.querySelector<HTMLElement>('[aria-label^="Acciones de"]')?.focus()
  }

  function openPanel(target: string, open: () => void) {
    setFocusTarget(fid(target))
    open()
  }

  // Primera casilla que se puede marcar: la del idioma principal está deshabilitada
  // y no admite foco.
  const firstEditableLang = LANGUAGE_OPTIONS.find(o => o.value !== agent.language)?.value

  // Mismas condiciones que tenían los botones sueltos de la fila.
  const entries: MenuEntry[] = []
  if (canManage) {
    entries.push({ type: 'item', label: 'Editar', onSelect: () => openPanel('name', () => setEditing(true)) })
  }
  if (canEditSelf) {
    entries.push(
      { type: 'item', label: 'Descripción', onSelect: () => openPanel('desc', () => { setEditingDesc(v => !v); setDesc(descSaved); setDescErr(null) }) },
      { type: 'item', label: 'Portada', onSelect: () => openPanel('cover', () => { setEditingCover(v => !v); setCoverErr(null) }) },
      { type: 'item', label: 'Idiomas', onSelect: () => openPanel(firstEditableLang ? 'lang-first' : 'langs-save', () => { setEditingLangs(v => !v); setLangs(langsSaved); setLangErr(null) }) },
    )
  }
  if (canManageOwner && hasAccess && !isOwner) {
    entries.push({ type: 'item', label: ownerBusy ? 'Transfiriendo…' : 'Hacer propietario', disabled: ownerBusy, onSelect: () => { setFocusTarget(null); handleMakeOwner() } })
  }
  if (canManage) {
    if (hasAccess) {
      // La confirmación destructiva arranca con el foco en Cancelar.
      entries.push({ type: 'item', label: 'Revocar acceso', onSelect: () => openPanel('revoke-cancel', () => { setAccessMode('confirmRevoke'); setAccessErr(null) }) })
    } else {
      if (canLinkSelf) {
        entries.push({ type: 'item', label: 'Vincular a mi cuenta', disabled: accessPending, onSelect: () => { setFocusTarget(null); handleLinkSelf() } })
      }
      entries.push({ type: 'item', label: 'Invitar acceso', onSelect: () => openPanel('invite', () => { setInviteEmail(agent.email ?? ''); setAccessMode('inviting'); setAccessErr(null); setAccessMsg(null) }) })
    }
  }
  if (canDeleteAgents && !isOwner) {
    if (entries.length > 0) entries.push({ type: 'separator' })
    entries.push({ type: 'item', label: 'Eliminar', tone: 'danger', onSelect: () => openPanel('delete-cancel', () => { setDeleteStep('confirm1'); setDangerErr(null); setConfirmText('') }) })
  }

  const hasPanels = ownerBusy || (accessPending && accessMode === 'idle') || !!dangerErr || deleteStep !== 'idle' || editingDesc || descOk || editingCover
    || editingLangs || langOk || accessMode !== 'idle' || !!accessMsg || !!accessErr || editing

  return (
    <div className="settings-agent" ref={rowRef}>
      <div className="dt-grid dt-row">
        <div className="settings-agent-who">
          <AgentAvatar agent={agent} />
          <div className="settings-agent-name-line">
            <span className="settings-agent-name">{agent.name}</span>
            {isOwner && <span className="pill" data-tone="gold">Propietario</span>}
          </div>
        </div>

        <div className="settings-agent-langs dt-hide-sm">
          {langsSaved.map(l => <span key={l} className="pill" data-tone="mute">{LANGUAGE_LABELS[l] ?? l}</span>)}
        </div>

        <span className="settings-agent-email dt-hide-md">{agent.email}</span>

        <span className="pill pill-dot" data-tone={hasAccess ? 'green' : 'mute'} style={{ justifySelf: 'start' }}>
          {hasAccess ? 'Con acceso' : 'Sin acceso'}
        </span>

        <div className="settings-agent-menu">
          {entries.length > 0 && (
            <RowMenu
              entries={entries}
              label={agent.name}
              finalFocus={() => {
                // Se usa una vez: si no, un Escape posterior del ⋯ iría a un panel viejo.
                const target = focusTarget ? document.getElementById(focusTarget) : null
                setFocusTarget(null)
                return target
              }}
            />
          )}
        </div>
      </div>

      {hasPanels && (
        <div className="settings-agent-panels">
          {/* El menú ⋯ se cierra al elegir: el pendiente de estas dos acciones se ve aquí. */}
          {ownerBusy && <p className="settings-note" role="status">Transfiriendo…</p>}
          {accessPending && accessMode === 'idle' && <p className="settings-note" role="status">Vinculando…</p>}
          {dangerErr && (
            <p className="settings-alert" role="alert"><AlertCircle size={13} aria-hidden="true" /> {dangerErr}</p>
          )}

          {/* Eliminar agente — doble verificación */}
          {deleteStep !== 'idle' && (
            <div className="settings-panel settings-panel-danger">
              {deleteStep === 'confirm1' ? (
                <>
                  <p className="settings-confirm-text">
                    Vas a eliminar a <strong>{agent.name}</strong>. Sus leads, fuentes, secuencias y propiedades se
                    <strong> reasignan al propietario</strong> del equipo (no se pierde nada). Su acceso de login se elimina.
                  </p>
                  <div className="settings-actions">
                    <button type="button" className="btn btn-danger" onClick={() => setDeleteStep('confirm2')}>Continuar</button>
                    <button type="button" id={fid('delete-cancel')} className="btn btn-ghost" onClick={() => closePanel(() => setDeleteStep('idle'))}>Cancelar</button>
                  </div>
                </>
              ) : (
                <>
                  <p className="settings-confirm-text">
                    Confirmación final. Escribe <strong>{agent.name}</strong> para eliminar al agente y reasignar su trabajo.
                  </p>
                  <input
                    id={fid('confirm')}
                    className="settings-input"
                    aria-label={`Escribe ${agent.name} para confirmar`}
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder={agent.name}
                    autoFocus
                  />
                  <div className="settings-actions">
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleDelete}
                      disabled={dangerBusy || confirmText.trim() !== agent.name.trim()}
                    >
                      {dangerBusy ? 'Eliminando…' : 'Eliminar definitivamente'}
                    </button>
                    <button type="button" className="btn btn-ghost" onClick={() => closePanel(() => setDeleteStep('idle'))}>Cancelar</button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Cómo se presenta el agente — contexto para la IA */}
          {editingDesc && (
            <div className="settings-panel">
              <div className="settings-field-label settings-field-label-inline">
                <label htmlFor={fid('desc')}>Cómo te presentas</label>
                <InfoHint label="Para qué sirve la descripción">
                  Especialidad, tipo de cliente con el que mejor trabajas, idiomas, trayectoria, estilo.
                  La IA lo usa para personalizar el análisis de cada lead y el contenido que se le envía.
                </InfoHint>
              </div>
              <textarea
                id={fid('desc')}
                className="settings-input settings-input-wide"
                value={desc}
                onChange={e => { setDesc(e.target.value); setDescErr(null) }}
                rows={4}
                maxLength={3000}
                placeholder="Ej.: Llevo 8 años en Hampton Roads, sobre todo con familias militares y compradores primerizos con VA Loan. Atiendo en inglés y español. Prefiero explicar el proceso completo antes de enseñar casas."
              />
              {descErr && <p className="settings-alert" role="alert"><AlertCircle size={13} aria-hidden="true" /> {descErr}</p>}
              <div className="settings-actions">
                <button type="button" className="btn btn-primary" onClick={handleSaveDesc} disabled={descPending || desc === descSaved}>
                  {descPending ? 'Guardando…' : 'Guardar descripción'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => closePanel(() => { setEditingDesc(false); setDesc(descSaved); setDescErr(null) })}>Cancelar</button>
              </div>
            </div>
          )}
          {descOk && (
            <p className="settings-success" role="status"><Check size={13} aria-hidden="true" /> Descripción guardada. La IA ya la tiene en cuenta.</p>
          )}

          {/* Portada del agente — la usan los diseños del Estudio */}
          {editingCover && (
            <div className="settings-panel">
              <div className="settings-field-label settings-field-label-inline">
                <label htmlFor={fid('cover')}>Tu portada</label>
                <InfoHint label="Para qué sirve la portada">
                  Aparece dentro de un círculo en los diseños del Estudio que tienen espacio para ti.
                  Sube una foto donde se te vea de cerca y centrado: el recorte toma el centro de
                  atención de la imagen.
                </InfoHint>
              </div>

              <div className="settings-cover">
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- reason: bucket público con host variable por entorno
                  <img
                    className="settings-cover-preview"
                    src={coverUrl}
                    alt=""
                    // El recorte se enseña tal cual; la foto normal, en círculo,
                    // que es exactamente como saldrá en la pieza.
                    data-cutout={coverCutout ? '' : undefined}
                  />
                ) : (
                  <div className="settings-cover-empty" />
                )}

                <div className="settings-cover-file">
                  <input
                    id={fid('cover')}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={coverPending}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f) }}
                  />
                  {coverUrl && <div>Así se verá en los diseños.</div>}
                </div>
              </div>

              {coverPending && <p className="settings-note" role="status">Subiendo…</p>}
              {coverErr && <p className="settings-alert" role="alert"><AlertCircle size={13} aria-hidden="true" /> {coverErr}</p>}

              <div className="settings-actions">
                {coverUrl && (
                  <button type="button" className="btn btn-ghost" onClick={handleCoverRemove} disabled={coverPending}>Quitar portada</button>
                )}
                <button type="button" className="btn btn-ghost" onClick={() => closePanel(() => setEditingCover(false))}>Cerrar</button>
              </div>
            </div>
          )}

          {/* Panel de idiomas registrados */}
          {editingLangs && (
            <div className="settings-panel">
              <div className="settings-field-label settings-field-label-inline">
                <span id={fid('langs-label')}>Idiomas que atiende</span>
                <InfoHint label="Cómo funcionan los idiomas">
                  Cada idioma registrado agrega los 3 emails de cierre del agente en ese idioma
                  (sección Emails de cierre). El idioma principal define el ruteo de leads y no puede quitarse.
                </InfoHint>
              </div>
              <div className="settings-check-grid" role="group" aria-labelledby={fid('langs-label')}>
                {LANGUAGE_OPTIONS.map(o => {
                  const isPrimary = o.value === agent.language
                  return (
                    <label key={o.value} className="settings-check" data-locked={isPrimary ? '' : undefined} htmlFor={fid(o.value === firstEditableLang ? 'lang-first' : `lang-${o.value}`)}>
                      <input
                        id={fid(o.value === firstEditableLang ? 'lang-first' : `lang-${o.value}`)}
                        type="checkbox"
                        checked={langs.includes(o.value)}
                        disabled={isPrimary}
                        onChange={() => toggleLang(o.value)}
                      />
                      {o.label}
                      {isPrimary && <span className="settings-check-note">(principal)</span>}
                    </label>
                  )
                })}
              </div>
              {langErr && <p className="settings-alert" role="alert"><AlertCircle size={13} aria-hidden="true" /> {langErr}</p>}
              <div className="settings-actions">
                <button type="button" id={fid('langs-save')} className="btn btn-primary" onClick={handleSaveLangs} disabled={langPending}>
                  {langPending ? 'Guardando…' : 'Guardar idiomas'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => closePanel(() => { setEditingLangs(false); setLangs(langsSaved); setLangErr(null) })}>Cancelar</button>
              </div>
            </div>
          )}
          {langOk && (
            <p className="settings-success" role="status"><Check size={13} aria-hidden="true" /> Idiomas guardados. Sus emails de cierre ya están disponibles en la sección Emails.</p>
          )}

          {/* Invite panel */}
          {accessMode === 'inviting' && (
            <div className="settings-panel">
              <div className="settings-field-label settings-field-label-inline">
                <label htmlFor={fid('invite')}>Email de acceso del agente</label>
              </div>
              <p className="settings-note">No se envía email automático — comparte el mensaje de confirmación con el agente.</p>
              <div className="settings-actions-fill">
                <input id={fid('invite')} className="settings-input" type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="agente@email.com" />
                <button type="button" className="btn btn-primary" onClick={handleInvite} disabled={accessPending}>
                  {accessPending ? 'Invitando…' : 'Enviar invitación'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => closePanel(() => { setAccessMode('idle'); setAccessErr(null) })}>Cancelar</button>
              </div>
            </div>
          )}

          {/* Revoke confirm panel */}
          {accessMode === 'confirmRevoke' && (
            <div className="settings-panel settings-panel-danger">
              <p className="settings-confirm-text">
                ¿Revocar el acceso de <strong>{agent.name}</strong>? Pierde el acceso de inmediato; sus leads atribuidos NO se tocan.
              </p>
              <div className="settings-actions">
                <button type="button" className="btn btn-danger" onClick={handleRevoke} disabled={accessPending}>
                  {accessPending ? 'Revocando…' : 'Sí, revocar acceso'}
                </button>
                <button type="button" id={fid('revoke-cancel')} className="btn btn-ghost" onClick={() => closePanel(() => setAccessMode('idle'))}>Cancelar</button>
              </div>
            </div>
          )}

          {accessMsg && (
            <p className="settings-success" role="status"><Check size={13} aria-hidden="true" /> {accessMsg}</p>
          )}
          {accessErr && (
            <p className="settings-alert" role="alert"><AlertCircle size={13} aria-hidden="true" /> {accessErr}</p>
          )}

          {/* Edición de los datos del agente */}
          {editing && (
            <div className="settings-panel">
              <div className="settings-form-grid">
                <div>
                  <label className="settings-field-label" htmlFor={fid('name')}>Nombre</label>
                  <input id={fid('name')} className="settings-input" value={name} onChange={e => setName(e.target.value)} />
                </div>
                <div>
                  <label className="settings-field-label" htmlFor={fid('initials')}>Iniciales del avatar</label>
                  <input id={fid('initials')} className="settings-input" value={initials} onChange={e => setInitials(e.target.value)} maxLength={2} />
                </div>
                <div>
                  <label className="settings-field-label" htmlFor={fid('email')}>Email</label>
                  <input id={fid('email')} className="settings-input" value={email} onChange={e => setEmail(e.target.value)} type="email" />
                </div>
                <div>
                  <label className="settings-field-label" htmlFor={fid('phone')}>Teléfono</label>
                  <input id={fid('phone')} className="settings-input" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div>
                  <label className="settings-field-label" htmlFor={fid('color-hex')}>Color de acento</label>
                  <div className="settings-color-row">
                    <input className="settings-color-input" type="color" aria-label="Elegir color de acento" value={color} onChange={e => setColor(e.target.value)} />
                    <input id={fid('color-hex')} className="settings-input settings-input-mono" value={color} onChange={e => setColor(e.target.value)} maxLength={7} />
                  </div>
                </div>
              </div>

              {error && <p className="settings-alert" role="alert"><AlertCircle size={13} aria-hidden="true" /> {error}</p>}

              <div className="settings-actions">
                <button type="button" className="btn btn-primary" onClick={handleSave} disabled={pending}>
                  {pending ? 'Guardando…' : 'Guardar'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => closePanel(() => { setEditing(false); setName(agent.name); setEmail(agent.email ?? ''); setPhone(agent.phone ?? ''); setColor(agent.accentColor); setInitials(agent.avatarInitials); setError(null) })}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
