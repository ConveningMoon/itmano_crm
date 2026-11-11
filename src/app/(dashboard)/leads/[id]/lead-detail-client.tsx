'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LANGUAGE_CONFIG } from '@/lib/config'
import { STAGE_CONFIG, type Stage } from '@/lib/scoring/priority'
import type { Lead, Agent, LeadEvent, PurchaseProcess } from '@/lib/types'
import type { ChannelOption } from '../new/page'
import { updateLeadStage, completePurchaseProcess, updateLeadNotes, startPurchaseProcess, deleteLead } from './actions'
import {
  ArrowLeft, ChevronDown, MoreHorizontal, X, Trash2,
  Mail, XCircle,
  Copy, Check,
} from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { Tabs } from '@/components/ui/tabs'
import { FormSection } from '@/components/ui/form-section'
import { ActivityTimeline } from './activity-timeline'
import { EditLeadModal } from './edit-lead-modal'
import { SendEmailModal, type EmailSendingInfo } from './send-email-modal'
import { AiFitCard, type AiFitBriefing } from './ai-fit-card'
import { PriorityCard, type LeadPriority, type LeadPotentialValue } from './priority-card'
import type { LeadOpportunity } from '@/lib/scoring/opportunities'
import { ManualActionsPanel, type ManualActionItem } from './manual-actions-panel'
import { StatusHistoryTimeline } from './status-history-timeline'
import type { StatusChange } from '@/lib/data/lead-status-history'
import { LeadSubmissionsList } from './lead-submissions-list'
import type { LeadSubmissionRow } from '@/lib/data/form-submissions'
import { LeadEmailRepliesList } from './lead-email-replies-list'
import type { LeadEmailReply } from '@/lib/data/lead-email-replies'
import type { ScoreBreakdown } from '@/lib/scoring/score-breakdown'
import { getLeadSource } from '@/lib/leads/source'
import type { LeadTag } from '@/lib/leads/tags'
import { LeadTagsCard } from './lead-tags-card'
import { FechaLocal } from '@/components/ui/local-date'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFullDate(dateStr: string) {
  return <FechaLocal fecha={dateStr} opciones={{ day: 'numeric', month: 'long', year: 'numeric' }} />
}

function formatDateTime(dateStr: string) {
  return (
    <FechaLocal fecha={dateStr} opciones={{
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }} />
  )
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0)
  const l = lastName.charAt(0)
  return (f + l).toUpperCase() || f.toUpperCase()
}

// Estilo con variables CSS (`--tone`), que React no tipa.
const tone = (color: string) => ({ '--tone': color }) as React.CSSProperties

// ─── Constants ────────────────────────────────────────────────────────────────

const LOAN_TYPES = ['VA Loan', 'FHA', 'Convencional', 'USDA', 'Jumbo', 'Cash']

// Icono de copiar en línea (junto al email/teléfono del perfil). Maneja su
// propio feedback de "copiado".
function InlineCopy({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600) }}
      title={`Copiar ${label}`}
      aria-label={copied ? `${label} copiado` : `Copiar ${label}`}
      data-state={copied ? 'copied' : undefined}
      className="icon-btn copy-btn"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
    </button>
  )
}

// Tarjeta con título: la caja de cada bloque del detalle.
function Card({ title, end, children }: { title: string; end?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="settings-card">
      <div className="settings-card-head">
        <h2 className="settings-card-title">{title}</h2>
        {end}
      </div>
      {children}
    </section>
  )
}

function InfoList({ rows }: { rows: { label: string; value: React.ReactNode; copy?: string }[] }) {
  return (
    <dl className="info-list">
      {rows.map(row => (
        <div key={row.label} className="info-row">
          <dt className="info-label">{row.label}</dt>
          <dd className="info-value">
            {row.value}
            {row.copy && <InlineCopy text={row.copy} label={row.label.toLowerCase()} />}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function StagePill({ stage }: { stage: Stage }) {
  return <span className="pill pill-square" style={tone(STAGE_CONFIG[stage].color)}>{STAGE_CONFIG[stage].label}</span>
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface LeadDetailProps {
  lead: Lead
  agent: Agent | undefined
  agents: Agent[]
  channels: ChannelOption[]
  events: LeadEvent[]
  submissions: LeadSubmissionRow[]
  emailReplies: LeadEmailReply[]
  purchaseProcess: PurchaseProcess | null
  manualActions: ManualActionItem[]
  statusHistory: StatusChange[]
  scoreBreakdown: ScoreBreakdown
  opportunities: LeadOpportunity[]
  priority: LeadPriority | null
  potentialValue: LeadPotentialValue | null
  emailSending?: EmailSendingInfo
  aiFit?: { enabled: boolean; briefing: AiFitBriefing | null; at: string | null }
  // Etiquetas del lead + catálogo del tenant (116). `canTag` es el permiso de
  // escritura del lead, no el de administrar el catálogo.
  tags: LeadTag[]
  tagCatalog: LeadTag[]
  canTag: boolean
  // Etiquetas que hoy disparan una secuencia de email (117).
  emailTagIds: string[]
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function LeadDetailClient({ lead, agent, agents, channels, events, submissions, emailReplies, purchaseProcess, manualActions, statusHistory, scoreBreakdown, opportunities, priority, potentialValue, emailSending, aiFit, tags, tagCatalog, canTag, emailTagIds }: LeadDetailProps) {
  const router = useRouter()

  const [currentStage, setCurrentStage] = useState<Stage>(lead.stage)
  const [notes, setNotes]                 = useState(lead.notes ?? '')
  const [savedNotes, setSavedNotes]       = useState(lead.notes ?? '')
  const [showProcessModal, setShowProcessModal] = useState(false)
  const [modalAddress, setModalAddress]     = useState('')
  const [modalLoanType, setModalLoanType]   = useState('VA Loan')
  const [modalClosingDate, setModalClosingDate] = useState('')
  const [modalNotes, setModalNotes]         = useState('')
  const [showEditModal, setShowEditModal]   = useState(false)
  const [showEmailModal, setShowEmailModal] = useState(false)
  // Tab activo del historial (controlado) — permite que los eventos de la
  // actividad enlacen a su contenido (formulario / correo).
  const [historyTab, setHistoryTab] = useState('actividad')
  function openHistoryTab(tab: string) {
    setHistoryTab(tab)
    document.getElementById('lead-history')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const [confirmClose, setConfirmClose]     = useState(false)
  const [confirmLost, setConfirmLost]       = useState(false)
  const [actionError, setActionError]       = useState<string | null>(null)
  // true cuando startPurchaseProcess se bloquea por faltar los emails de cierre:
  // en ese caso el error se muestra como alerta con botón a /emails, no como
  // texto simple de error.
  const [needsClosingEmails, setNeedsClosingEmails] = useState(false)
  const [isPending, startTransition]        = useTransition()

  // Delete lead — two-step confirmation
  const [deleteStep,  setDeleteStep]  = useState<0 | 1 | 2>(0)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting,  startDelete]    = useTransition()

  function handleDeleteConfirm() {
    setDeleteError(null)
    startDelete(async () => {
      const res = await deleteLead(lead.id)
      if (!res.ok) { setDeleteError(res.error); return }
      router.push('/leads')
    })
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing server-prop to local state after router.refresh()
  useEffect(() => { setCurrentStage(lead.stage) }, [lead.stage])

  const channel    = channels.find(c => c.id === lead.acquisitionChannelId)
  const leadSource = getLeadSource(channel?.channelType ?? null, lead.trafficSource ?? null)
  const langCfg    = LANGUAGE_CONFIG[lead.language]
  const initials  = getInitials(lead.firstName, lead.lastName)

  // El proceso de compra sigue vivo mientras no se haya marcado completado. Su
  // estado ya no se deduce de la etapa del lead: vive en purchase_processes.
  const isProcessActive = currentStage === 'en_proceso' || purchaseProcess?.completedAt != null

  const infoRows: { label: string; value: React.ReactNode; copy?: string }[] = [
    { label: 'Nombre',      value: `${lead.firstName} ${lead.lastName}` },
    { label: 'Email',       value: lead.email, copy: lead.email },
    { label: 'Teléfono',    value: lead.phone || '—', copy: lead.phone || undefined },
    { label: 'Idioma',      value: `${langCfg.flag} ${langCfg.label}` },
    { label: 'Registrado',  value: formatFullDate(lead.createdAt) },
    { label: 'Prestamista', value: lead.lender || '—' },
    { label: 'Última act.', value: formatFullDate(lead.updatedAt) },
  ]

  const isClosed = currentStage === 'cerrado' || currentStage === 'perdido'

  function changeStage(stage: 'cerrado' | 'perdido') {
    startTransition(async () => {
      setActionError(null)
      const res = await updateLeadStage(lead.id, stage)
      if (res.ok) setCurrentStage(stage)
      else setActionError(res.error)
    })
  }

  return (
    <div>
      {/* ── Cabecera ── */}
      <button type="button" onClick={() => router.back()} className="back-link">
        <ArrowLeft size={14} aria-hidden="true" /> Volver a Leads
      </button>

      <header className="page-header">
        <div className="lead-identity">
          <span className="avatar avatar-lg" style={agent ? tone(agent.accentColor) : undefined} aria-hidden="true">
            {initials}
          </span>
          <div className="dt-cell-main">
            <div className="lead-identity-name">
              <h1 className="page-title">{lead.firstName} {lead.lastName}</h1>
              <StagePill stage={currentStage} />
            </div>
            <div className="lead-identity-meta">
              <span>{lead.email}</span>
              {lead.phone && <><span aria-hidden="true">·</span><span>{lead.phone}</span></>}
              <span aria-hidden="true">·</span>
              <span>{langCfg.flag} {langCfg.label}</span>
            </div>
          </div>
        </div>

        <div className="page-actions">
          <button
            type="button"
            onClick={() => setShowEmailModal(true)}
            className="btn btn-primary"
            title="Redactar un correo (corporativo o personal), con IA opcional"
          >
            <Mail size={14} aria-hidden="true" /> Enviar correo
          </button>
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="btn btn-ghost btn-icon"
            title="Editar lead"
            aria-label="Editar lead"
          >
            <MoreHorizontal size={16} />
          </button>
          <button
            type="button"
            onClick={() => { setDeleteStep(1); setDeleteInput(''); setDeleteError(null) }}
            className="btn btn-danger btn-icon"
            title="Eliminar lead"
            aria-label="Eliminar lead"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {/* ── Dos columnas (una por debajo de 1100px) ── */}
      <div className="lead-detail-grid">

        <div className="lead-col">
          <Card title="Información del lead">
            <InfoList rows={infoRows} />
          </Card>

          {/* Etiquetas: lo que una persona decidió sobre el lead. Va justo debajo
              de la información y antes de prioridad porque es lo que el agente
              lee y cambia más seguido — y desde la 117, lo que dispara los
              correos obligatorios de seguimiento. */}
          <LeadTagsCard
            leadId={lead.id}
            tags={tags}
            catalog={tagCatalog}
            canEdit={canTag}
            emailTagIds={emailTagIds}
          />

          {/* Prioridad — reemplaza "Temperatura del lead" y "Desglose del score".
              El agente no trabaja con fit/engagement/manual: trabaja con a quién
              llamar y por qué. El desglose sigue dentro, plegado. */}
          <PriorityCard priority={priority} breakdown={scoreBreakdown} opportunities={opportunities} potentialValue={potentialValue} />

          {aiFit && (
            <AiFitCard leadId={lead.id} enabled={aiFit.enabled} briefing={aiFit.briefing} at={aiFit.at} />
          )}

          <Card title="Notas">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Agrega notas sobre este lead..."
              aria-label="Notas del lead"
              className="settings-input settings-input-wide"
            />
            {notes !== savedNotes && (
              <div className="settings-actions settings-actions-end settings-stack-top">
                <button
                  type="button"
                  onClick={() => {
                    startTransition(async () => {
                      setActionError(null)
                      const res = await updateLeadNotes(lead.id, notes)
                      if (res.ok) setSavedNotes(notes)
                    })
                  }}
                  disabled={isPending}
                  aria-busy={isPending}
                  className="btn btn-primary"
                >
                  {isPending ? 'Guardando…' : 'Guardar nota'}
                </button>
              </div>
            )}
          </Card>

          <Card title="Proceso de Compra" end={isProcessActive ? <StagePill stage={currentStage} /> : undefined}>
            {isClosed && (
              <p className="settings-note settings-note-gap">Proceso deshabilitado — lead cerrado.</p>
            )}
            <div className={isClosed ? 'is-disabled' : undefined} aria-disabled={isClosed || undefined}>
              {isProcessActive ? (
                <div className="settings-stack settings-stack-tight">
                  <InfoList rows={[
                    { label: 'Propiedad',   value: purchaseProcess?.address    ?? '—' },
                    { label: 'Tipo loan',   value: purchaseProcess?.loanType   ?? '—' },
                    { label: 'Inicio',      value: purchaseProcess?.createdAt  ? formatFullDate(purchaseProcess.createdAt) : '—' },
                    { label: 'Cierre est.', value: purchaseProcess?.closingDate ? formatFullDate(purchaseProcess.closingDate) : '—' },
                  ]} />

                  {currentStage === 'en_proceso' && (
                    <button
                      type="button"
                      onClick={() => {
                        startTransition(async () => {
                          setActionError(null)
                          const res = await completePurchaseProcess(lead.id)
                          if (res.ok) setCurrentStage('cerrado')
                          else setActionError(res.error)
                        })
                      }}
                      disabled={isPending}
                      aria-busy={isPending}
                      className="btn btn-ghost btn-block"
                      data-tone="gold"
                    >
                      Marcar como Completado
                    </button>
                  )}
                </div>
              ) : (
                <div className="settings-stack settings-stack-tight settings-stack-start">
                  <p className="settings-note">Este lead aún no tiene un proceso de compra activo.</p>
                  <button type="button" onClick={() => setShowProcessModal(true)} className="btn btn-ghost" data-tone="gold">
                    + Iniciar proceso de compra
                  </button>
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="lead-col">
          <Card title="Agente asignado">
            {agent ? (
              <div className="settings-stack settings-stack-tight">
                <div className="lead-identity">
                  <span className="avatar avatar-md" style={tone(agent.accentColor)} aria-hidden="true">
                    {agent.avatarInitials}
                  </span>
                  <div className="dt-cell-main">
                    <span className="dt-title">{agent.name}</span>
                    <span className="dt-sub">{agent.languages.map(l => LANGUAGE_CONFIG[l]?.label ?? l).join(', ')}</span>
                  </div>
                </div>
                <p className="settings-note">{agent.email}<br />{agent.phone ?? '—'}</p>
              </div>
            ) : (
              <p className="settings-note">Sin agente asignado</p>
            )}
          </Card>

          {/* Fuente compuesta: el tipo de canal manda sobre traffic_source (mismo
              modelo que la columna de /leads y la dona de analíticas). */}
          <Card title="Origen del lead">
            {leadSource.label === '—' ? (
              <p className="settings-note">Origen no registrado</p>
            ) : (
              <div className="settings-stack settings-stack-tight">
                <div>
                  <span className="dt-title">{leadSource.label}</span>
                  {channel && <span className="dt-sub">{channel.name}</span>}
                </div>
                <div>
                  <span className="info-label">Registrado</span>
                  <span className="dt-sub">{formatDateTime(lead.createdAt)}</span>
                </div>
              </div>
            )}
          </Card>

          <Card title="Acciones">
            {/* El envío (corporativo o personal) vive en el botón "Enviar correo"
                del encabezado. Copiar email/teléfono vive junto al dato. */}
            <div className="action-list">
              {confirmClose ? (
                <div className="action-confirm">
                  <button
                    type="button"
                    onClick={() => { setConfirmClose(false); changeStage('cerrado') }}
                    className="btn btn-primary"
                  >
                    ¿Confirmar cierre?
                  </button>
                  <button type="button" onClick={() => setConfirmClose(false)} className="btn btn-ghost btn-icon" aria-label="Cancelar cierre">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmClose(true)}
                  disabled={isClosed || isPending}
                  aria-busy={isPending}
                  className="btn btn-ghost btn-block btn-start"
                >
                  <XCircle size={14} className="text-gold" aria-hidden="true" /> Marcar como Cerrado
                </button>
              )}

              {confirmLost ? (
                <div className="action-confirm">
                  <button
                    type="button"
                    onClick={() => { setConfirmLost(false); changeStage('perdido') }}
                    className="btn btn-danger"
                  >
                    ¿Confirmar pérdida?
                  </button>
                  <button type="button" onClick={() => setConfirmLost(false)} className="btn btn-ghost btn-icon" aria-label="Cancelar pérdida">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmLost(true)}
                  disabled={isClosed || isPending}
                  aria-busy={isPending}
                  className="btn btn-ghost btn-block btn-start"
                >
                  <XCircle size={14} aria-hidden="true" /> Marcar como Perdido
                </button>
              )}
            </div>

            {actionError && !showProcessModal && <p role="alert" className="form-error settings-stack-top">{actionError}</p>}
          </Card>
        </div>
      </div>

      <div className="lead-section">
        <ManualActionsPanel
          leadId={lead.id}
          currentStage={currentStage}
          actions={manualActions}
        />
      </div>

      {/* ── Historial del lead: actividad, formularios, emails y estados ── */}
      <div id="lead-history" className="lead-section">
        <Tabs
          value={historyTab}
          onChange={setHistoryTab}
          items={[
            { key: 'actividad',   label: 'Actividad',   badge: events.length },
            { key: 'formularios', label: 'Formularios', badge: submissions.length },
            { key: 'emails',      label: 'Emails',      badge: emailReplies.length },
            { key: 'historial',   label: 'Historial',   badge: statusHistory.length },
          ]}
          content={{
            actividad:   <ActivityTimeline events={events} onOpen={openHistoryTab} />,
            formularios: <LeadSubmissionsList submissions={submissions} />,
            emails:      <LeadEmailRepliesList replies={emailReplies} />,
            historial:   <StatusHistoryTimeline changes={statusHistory} />,
          }}
        />
      </div>

      <EditLeadModal
        lead={lead}
        agents={agents}
        channels={channels}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
      />

      <SendEmailModal
        open={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        leadId={lead.id}
        leadEmail={lead.email}
        language={lead.language}
        leadFirstName={lead.firstName}
        agentName={agent?.name}
        sending={emailSending}
      />

      {/* ── Modal: Iniciar proceso ── */}
      <ModalShell open={showProcessModal} onClose={() => setShowProcessModal(false)} maxWidth={480}>
        <div className="settings-modal">
          <div className="settings-inline settings-inline-between">
            <div>
              <h2 className="settings-modal-title">Iniciar proceso de compra</h2>
              <p className="settings-note">Lead: {lead.firstName} {lead.lastName}</p>
            </div>
            <button type="button" onClick={() => setShowProcessModal(false)} aria-label="Cerrar" className="icon-btn">
              <X size={18} />
            </button>
          </div>

          <FormSection title="Propiedad" first>
            <div>
              <label htmlFor="process-address" className="settings-field-label">Dirección de la propiedad</label>
              <input
                id="process-address"
                type="text"
                value={modalAddress}
                onChange={e => setModalAddress(e.target.value)}
                placeholder="123 Ocean View Dr, Norfolk, VA"
                className="settings-input settings-input-wide"
              />
            </div>
            <div>
              <label htmlFor="process-loan" className="settings-field-label">Tipo de préstamo</label>
              <span className="select-field select-field-full">
                <select
                  id="process-loan"
                  value={modalLoanType}
                  onChange={e => setModalLoanType(e.target.value)}
                  className="settings-input"
                >
                  {LOAN_TYPES.map(lt => <option key={lt} value={lt}>{lt}</option>)}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </span>
            </div>
          </FormSection>

          <FormSection title="Cierre">
            <div>
              <label htmlFor="process-closing" className="settings-field-label">
                Fecha estimada de cierre <span className="form-required" aria-hidden="true">*</span>
              </label>
              <input
                id="process-closing"
                type="date"
                value={modalClosingDate}
                onChange={e => setModalClosingDate(e.target.value)}
                required
                min={new Date().toISOString().slice(0, 10)}
                className="settings-input settings-input-wide input-date"
              />
            </div>
            <div>
              <label htmlFor="process-notes" className="settings-field-label">Notas internas</label>
              <textarea
                id="process-notes"
                value={modalNotes}
                onChange={e => setModalNotes(e.target.value)}
                rows={3}
                placeholder="Detalles del proceso..."
                className="settings-input settings-input-wide"
              />
            </div>
          </FormSection>

          {actionError && (
            needsClosingEmails ? (
              <div className="settings-note settings-note-gold settings-stack settings-stack-tight settings-stack-start">
                <span>{actionError}</span>
                <button type="button" onClick={() => router.push('/emails?tab=cierre')} className="btn btn-primary">
                  Configurar emails de cierre →
                </button>
              </div>
            ) : (
              <p role="alert" className="form-error">{actionError}</p>
            )
          )}

          <div className="settings-modal-actions">
            <button type="button" onClick={() => setShowProcessModal(false)} className="btn btn-ghost">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                startTransition(async () => {
                  setActionError(null)
                  setNeedsClosingEmails(false)
                  const res = await startPurchaseProcess(lead.id, {
                    address:     modalAddress,
                    loanType:    modalLoanType,
                    closingDate: modalClosingDate,
                    notes:       modalNotes,
                  })
                  if (res.ok) {
                    setShowProcessModal(false)
                    setModalAddress('')
                    setModalLoanType('VA Loan')
                    setModalClosingDate('')
                    setModalNotes('')
                  } else {
                    setActionError(res.error)
                    setNeedsClosingEmails(res.needsClosingEmails === true)
                  }
                })
              }}
              disabled={isPending}
              aria-busy={isPending}
              className="btn btn-primary"
            >
              {isPending ? 'Iniciando…' : 'Iniciar proceso →'}
            </button>
          </div>
        </div>
      </ModalShell>

      {/* ── Modal: Eliminar lead — Paso 1: primera confirmación ── */}
      <ModalShell open={deleteStep === 1} onClose={() => setDeleteStep(0)} maxWidth={440}>
        <div className="settings-modal">
          <div className="settings-inline settings-inline-between">
            <h2 className="settings-modal-title">Eliminar lead</h2>
            <button type="button" onClick={() => setDeleteStep(0)} aria-label="Cerrar" className="icon-btn"><X size={18} /></button>
          </div>
          <p className="settings-confirm-text">
            ¿Estás seguro de eliminar a <strong>{lead.firstName} {lead.lastName}</strong>?
            Esta acción eliminará todos sus eventos, runs de secuencia y notificaciones relacionadas.
          </p>
          <span className="settings-alert settings-alert-block">No se puede deshacer.</span>
          <div className="settings-modal-actions">
            <button type="button" onClick={() => setDeleteStep(0)} className="btn btn-ghost">Cancelar</button>
            <button type="button" onClick={() => { setDeleteStep(2); setDeleteInput('') }} className="btn btn-danger">
              Continuar →
            </button>
          </div>
        </div>
      </ModalShell>

      {/* ── Modal: Eliminar lead — Paso 2: confirmación por texto ── */}
      <ModalShell open={deleteStep === 2} onClose={() => setDeleteStep(0)} maxWidth={420}>
        <div className="settings-modal">
          <div className="settings-inline settings-inline-between">
            <h2 className="settings-modal-title">Confirmar eliminación</h2>
            <button type="button" onClick={() => setDeleteStep(0)} aria-label="Cerrar" className="icon-btn"><X size={18} /></button>
          </div>
          <p className="settings-confirm-text">
            Para confirmar, escribe <strong className="settings-input-mono">ELIMINAR</strong> en el campo:
          </p>
          <input
            value={deleteInput}
            onChange={e => setDeleteInput(e.target.value)}
            placeholder="ELIMINAR"
            aria-label="Escribe ELIMINAR para confirmar"
            autoFocus
            className="settings-input settings-input-mono"
          />
          {deleteError && <p role="alert" className="form-error">{deleteError}</p>}
          <div className="settings-modal-actions">
            <button type="button" onClick={() => setDeleteStep(0)} className="btn btn-ghost">Cancelar</button>
            <button
              type="button"
              onClick={handleDeleteConfirm}
              disabled={deleteInput !== 'ELIMINAR' || isDeleting}
              aria-busy={isDeleting}
              className="btn btn-danger"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar definitivamente'}
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  )
}
