'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Agent } from '@/lib/types'
import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import { updateAgent, inviteAgentAccess, revokeAgentAccess, linkAgentToMyAccount, updateAgentLanguages, setAgentAsOwner, deleteAgent, updateAgentDescription, updateAgentCoverPhoto, removeAgentCoverPhoto } from './actions'
import { INPUT, LABEL, BTN_PRIMARY, BTN_GHOST, LANGUAGE_OPTIONS } from './settings-styles'

const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGE_CODES.map(code => [code, LANGUAGE_CONFIG[code].label])
)

// ─── Agent edit row ───────────────────────────────────────────────────────────

export function AgentRow({ agent, hasAccess, canManage, canLinkSelf, canEditSelf, isOwner, canManageOwner, canDeleteAgents }: { agent: Agent; hasAccess: boolean; canManage: boolean; canLinkSelf: boolean; canEditSelf: boolean; isOwner: boolean; canManageOwner: boolean; canDeleteAgents: boolean }) {
  const router = useRouter()
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
      setDeleteStep('idle')
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
      setEditingDesc(false)
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
      setEditingLangs(false)
      setLangOk(true)
      setTimeout(() => setLangOk(false), 2500)
    })
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateAgent(agent.id, { name, email, phone, accentColor: color, avatarInitials: initials })
      if (!res.ok) { setError(res.error); return }
      setEditing(false)
    })
  }

  function handleInvite() {
    setAccessErr(null); setAccessMsg(null)
    startAccess(async () => {
      const res = await inviteAgentAccess(agent.id, inviteEmail)
      if (!res.ok) { setAccessErr(res.error); return }
      setAccessMsg(`Listo. ${res.email} ya puede entrar en app.itmano.com con su correo (Magic Link).`)
      setAccessMode('idle')
    })
  }

  function handleRevoke() {
    setAccessErr(null); setAccessMsg(null)
    startAccess(async () => {
      const res = await revokeAgentAccess(agent.id)
      if (!res.ok) { setAccessErr(res.error); return }
      setAccessMode('idle')
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

  return (
    <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '16px 20px' }}>
      {!editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Avatar */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: `${agent.accentColor}22`,
            border: `1px solid ${agent.accentColor}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 700,
            color: agent.accentColor,
            flexShrink: 0,
          }}>
            {agent.avatarInitials}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
              <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</span>
              {isOwner && (
                <span style={{
                  fontSize: '9px', fontWeight: 600, padding: '2px 7px', borderRadius: '10px',
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: 'var(--accent-gold)', background: 'rgba(201,169,110,0.14)',
                }}>
                  Propietario
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {langsSaved.map(l => LANGUAGE_LABELS[l] ?? l).join(', ')}
            </div>
          </div>

          {/* Access status badge */}
          <span style={{
            fontSize: '10px', fontWeight: 500, padding: '2px 8px', borderRadius: '10px',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            color: hasAccess ? 'var(--accent-green)' : 'var(--text-muted)',
            background: hasAccess ? 'rgba(107,163,104,0.12)' : 'var(--bg-elevated)',
          }}>
            {hasAccess ? 'Con acceso' : 'Sin acceso'}
          </span>

          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            {canEditSelf && (
              <>
                <button onClick={() => { setEditingDesc(v => !v); setDesc(descSaved); setDescErr(null) }} style={BTN_GHOST}>Descripción</button>
                <button onClick={() => { setEditingCover(v => !v); setCoverErr(null) }} style={BTN_GHOST}>Portada</button>
                <button onClick={() => { setEditingLangs(v => !v); setLangs(langsSaved); setLangErr(null) }} style={BTN_GHOST}>Idiomas</button>
              </>
            )}
            {canManageOwner && hasAccess && !isOwner && (
              <button onClick={handleMakeOwner} disabled={ownerBusy} style={BTN_GHOST}>
                {ownerBusy ? 'Transfiriendo…' : 'Hacer propietario'}
              </button>
            )}
            {canManage && (
              <>
                {hasAccess ? (
                  <button onClick={() => { setAccessMode('confirmRevoke'); setAccessErr(null) }} style={BTN_GHOST}>Revocar acceso</button>
                ) : (
                  <>
                    {canLinkSelf && (
                      <button onClick={handleLinkSelf} disabled={accessPending} style={BTN_GHOST}>Vincular a mi cuenta</button>
                    )}
                    <button onClick={() => { setInviteEmail(agent.email ?? ''); setAccessMode('inviting'); setAccessErr(null); setAccessMsg(null) }} style={BTN_GHOST}>Invitar acceso</button>
                  </>
                )}
                <button onClick={() => setEditing(true)} style={BTN_GHOST}>Editar</button>
              </>
            )}
            {canDeleteAgents && !isOwner && (
              <button onClick={() => { setDeleteStep('confirm1'); setDangerErr(null); setConfirmText('') }} style={{ ...BTN_GHOST, color: 'var(--accent-coral)', borderColor: 'rgba(201,123,107,0.3)' }}>Eliminar</button>
            )}
          </div>
        </div>

        {dangerErr && (
          <div style={{ fontSize: '12px', color: '#E04040', background: 'rgba(224,64,64,0.08)', borderRadius: '8px', padding: '8px 12px' }}>
            {dangerErr}
          </div>
        )}

        {/* Eliminar agente — doble verificación */}
        {deleteStep !== 'idle' && (
          <div style={{ background: 'rgba(224,64,64,0.06)', border: '1px solid rgba(224,64,64,0.25)', borderRadius: '8px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {deleteStep === 'confirm1' ? (
              <>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  Vas a eliminar a <strong>{agent.name}</strong>. Sus leads, fuentes, secuencias y propiedades se
                  <strong> reasignan al propietario</strong> del equipo (no se pierde nada). Su acceso de login se elimina.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setDeleteStep('confirm2')} style={{ ...BTN_PRIMARY, background: '#E04040' }}>Continuar</button>
                  <button onClick={() => setDeleteStep('idle')} style={BTN_GHOST}>Cancelar</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.6 }}>
                  Confirmación final. Escribe <strong>{agent.name}</strong> para eliminar al agente y reasignar su trabajo.
                </div>
                <input
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder={agent.name}
                  style={INPUT}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleDelete}
                    disabled={dangerBusy || confirmText.trim() !== agent.name.trim()}
                    style={{ ...BTN_PRIMARY, background: '#E04040', opacity: (dangerBusy || confirmText.trim() !== agent.name.trim()) ? 0.5 : 1, cursor: (dangerBusy || confirmText.trim() !== agent.name.trim()) ? 'default' : 'pointer' }}
                  >
                    {dangerBusy ? 'Eliminando…' : 'Eliminar definitivamente'}
                  </button>
                  <button onClick={() => setDeleteStep('idle')} style={BTN_GHOST}>Cancelar</button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Cómo se presenta el agente — contexto para la IA */}
        {editingDesc && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>Cómo te presentas</label>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Especialidad, tipo de cliente con el que mejor trabajas, idiomas, trayectoria, estilo.
              La IA lo usa para personalizar el análisis de cada lead y el contenido que se le envía.
            </div>
            <textarea
              value={desc}
              onChange={e => { setDesc(e.target.value); setDescErr(null) }}
              rows={4}
              maxLength={3000}
              placeholder={`Ej.: Llevo 8 años en Hampton Roads, sobre todo con familias militares y compradores primerizos con VA Loan. Atiendo en inglés y español. Prefiero explicar el proceso completo antes de enseñar casas.`}
              style={{ ...INPUT, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
            {descErr && <div style={{ fontSize: '12px', color: '#E04040' }}>{descErr}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSaveDesc} disabled={descPending || desc === descSaved} style={{ ...BTN_PRIMARY, opacity: (descPending || desc === descSaved) ? 0.5 : 1, cursor: (descPending || desc === descSaved) ? 'default' : 'pointer' }}>
                {descPending ? 'Guardando…' : 'Guardar descripción'}
              </button>
              <button onClick={() => { setEditingDesc(false); setDesc(descSaved); setDescErr(null) }} style={BTN_GHOST}>Cancelar</button>
            </div>
          </div>
        )}
        {descOk && (
          <div style={{ fontSize: '12px', color: 'var(--accent-green)', background: 'rgba(107,163,104,0.10)', border: '1px solid rgba(107,163,104,0.25)', borderRadius: '8px', padding: '10px 12px' }}>
            Descripción guardada. La IA ya la tiene en cuenta.
          </div>
        )}

        {/* Portada del agente — la usan los diseños del Estudio */}
        {editingCover && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>Tu portada</label>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Aparece dentro de un círculo en los diseños del Estudio que tienen espacio para ti.
              Sube una foto donde se te vea de cerca y centrado: el recorte toma el centro de
              atención de la imagen.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- reason: bucket público con host variable por entorno
                <img
                  src={coverUrl}
                  alt=""
                  style={{
                    width: '72px', height: '72px', objectFit: 'cover', flexShrink: 0,
                    // El recorte se enseña tal cual; la foto normal, en círculo,
                    // que es exactamente como saldrá en la pieza.
                    borderRadius: coverCutout ? '8px' : '50%',
                    background: coverCutout ? 'var(--bg-base)' : undefined,
                  }}
                />
              ) : (
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'var(--bg-base)', border: '1px dashed var(--border-subtle)', flexShrink: 0 }} />
              )}

              <div style={{ minWidth: 0, flex: 1 }}>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={coverPending}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f) }}
                  style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '100%' }}
                />
                {coverUrl && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                    Así se verá en los diseños.
                  </div>
                )}
              </div>
            </div>

            {coverPending && <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Subiendo…</div>}
            {coverErr && <div style={{ fontSize: '12px', color: '#E04040' }}>{coverErr}</div>}

            <div style={{ display: 'flex', gap: '8px' }}>
              {coverUrl && (
                <button onClick={handleCoverRemove} disabled={coverPending} style={BTN_GHOST}>Quitar portada</button>
              )}
              <button onClick={() => setEditingCover(false)} style={BTN_GHOST}>Cerrar</button>
            </div>
          </div>
        )}

        {/* Panel de idiomas registrados */}
        {editingLangs && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <label style={{ ...LABEL, marginBottom: 0 }}>Idiomas que atiende</label>
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              {LANGUAGE_OPTIONS.map(o => {
                const isPrimary = o.value === agent.language
                const checked = langs.includes(o.value)
                return (
                  <label key={o.value} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-primary)', cursor: isPrimary ? 'default' : 'pointer', opacity: isPrimary ? 0.8 : 1 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isPrimary}
                      onChange={() => toggleLang(o.value)}
                      style={{ accentColor: 'var(--accent-gold)' }}
                    />
                    {o.label}
                    {isPrimary && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>(principal)</span>}
                  </label>
                )
              })}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Cada idioma registrado agrega los 3 emails de cierre del agente en ese idioma
              (sección Emails de cierre). El idioma principal define el ruteo de leads y no puede quitarse.
            </div>
            {langErr && <div style={{ fontSize: '12px', color: '#E04040' }}>{langErr}</div>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSaveLangs} disabled={langPending} style={{ ...BTN_PRIMARY, opacity: langPending ? 0.6 : 1 }}>
                {langPending ? 'Guardando…' : 'Guardar idiomas'}
              </button>
              <button onClick={() => { setEditingLangs(false); setLangs(langsSaved); setLangErr(null) }} style={BTN_GHOST}>Cancelar</button>
            </div>
          </div>
        )}
        {langOk && (
          <div style={{ fontSize: '12px', color: 'var(--accent-green)', background: 'rgba(107,163,104,0.10)', border: '1px solid rgba(107,163,104,0.25)', borderRadius: '8px', padding: '10px 12px' }}>
            Idiomas guardados. Sus emails de cierre ya están disponibles en la sección Emails.
          </div>
        )}

        {/* Invite panel */}
        {accessMode === 'inviting' && (
          <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={LABEL}>Email de acceso del agente</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <input style={{ ...INPUT, flex: '1 1 220px' }} type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="agente@email.com" />
              <button onClick={handleInvite} disabled={accessPending} style={{ ...BTN_PRIMARY, opacity: accessPending ? 0.6 : 1 }}>
                {accessPending ? 'Invitando…' : 'Enviar invitación'}
              </button>
              <button onClick={() => { setAccessMode('idle'); setAccessErr(null) }} style={BTN_GHOST}>Cancelar</button>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              No se envía email automático — comparte el mensaje de confirmación con el agente.
            </div>
          </div>
        )}

        {/* Revoke confirm panel */}
        {accessMode === 'confirmRevoke' && (
          <div style={{ background: 'rgba(224,64,64,0.06)', border: '1px solid rgba(224,64,64,0.25)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
              ¿Revocar el acceso de <strong>{agent.name}</strong>? Pierde el acceso de inmediato; sus leads atribuidos NO se tocan.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleRevoke} disabled={accessPending} style={{ ...BTN_PRIMARY, background: '#E04040', opacity: accessPending ? 0.6 : 1 }}>
                {accessPending ? 'Revocando…' : 'Sí, revocar acceso'}
              </button>
              <button onClick={() => setAccessMode('idle')} style={BTN_GHOST}>Cancelar</button>
            </div>
          </div>
        )}

        {accessMsg && (
          <div style={{ fontSize: '12px', color: 'var(--accent-green)', background: 'rgba(107,163,104,0.10)', border: '1px solid rgba(107,163,104,0.25)', borderRadius: '8px', padding: '10px 12px' }}>
            {accessMsg}
          </div>
        )}
        {accessErr && (
          <div style={{ fontSize: '12px', color: '#E04040', background: 'rgba(224,64,64,0.08)', borderRadius: '8px', padding: '8px 12px' }}>
            {accessErr}
          </div>
        )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label style={LABEL}>Nombre</label>
              <input value={name} onChange={e => setName(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Iniciales del avatar</label>
              <input value={initials} onChange={e => setInitials(e.target.value)} style={INPUT} maxLength={2} />
            </div>
            <div>
              <label style={LABEL}>Email</label>
              <input value={email} onChange={e => setEmail(e.target.value)} style={INPUT} type="email" />
            </div>
            <div>
              <label style={LABEL}>Teléfono</label>
              <input value={phone} onChange={e => setPhone(e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Color de acento</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="color"
                  value={color}
                  onChange={e => setColor(e.target.value)}
                  style={{ width: '40px', height: '36px', padding: '2px', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', cursor: 'pointer' }}
                />
                <input value={color} onChange={e => setColor(e.target.value)} style={{ ...INPUT, flex: 1, fontFamily: 'monospace' }} maxLength={7} />
              </div>
            </div>
          </div>

          {error && <div style={{ fontSize: '12px', color: '#E04040', padding: '6px 10px', background: 'rgba(224,64,64,0.08)', borderRadius: '6px' }}>{error}</div>}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handleSave} disabled={pending} style={{ ...BTN_PRIMARY, opacity: pending ? 0.6 : 1 }}>
              {pending ? 'Guardando…' : 'Guardar'}
            </button>
            <button onClick={() => { setEditing(false); setName(agent.name); setError(null) }} style={BTN_GHOST}>
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
