'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { STATUS_CONFIG, LANGUAGE_CONFIG } from '@/lib/config'
import type { Lead, Agent, LeadEvent, LeadStatus, PurchaseProcess } from '@/lib/types'
import type { ChannelOption } from '../new/page'
import { updateLeadStatus, updateLeadNotes, startPurchaseProcess, deleteLead } from './actions'
import {
  ArrowLeft, MoreHorizontal, X, Trash2,
  UserPlus, Mail, FileDown, MousePointer2, Calendar,
  ArrowRightCircle, CheckCircle2, Circle,
  MessageCircle, XCircle,
  Phone, Activity,
  Copy, Check,
} from 'lucide-react'
import { ModalShell } from '@/components/motion/modal-shell'
import { EditLeadModal } from './edit-lead-modal'
import { ManualActionsPanel, type ManualActionItem } from './manual-actions-panel'
import { StatusHistoryTimeline } from './status-history-timeline'
import type { StatusChange } from '@/lib/data/lead-status-history'
import { LeadSubmissionsList } from './lead-submissions-list'
import type { LeadSubmissionRow } from '@/lib/data/form-submissions'
import { LeadEmailRepliesList } from './lead-email-replies-list'
import type { LeadEmailReply } from '@/lib/data/lead-email-replies'
import type { ScoreBreakdown } from '@/lib/scoring/score-breakdown'
import { getLeadSource } from '@/lib/leads/source'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('es-ES', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('es-ES', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0)
  const l = lastName.charAt(0)
  return (f + l).toUpperCase() || f.toUpperCase()
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FROZEN_STATUSES: LeadStatus[] = ['process_started', 'process_completed', 'closed', 'lost']

const LOAN_TYPES = ['VA Loan', 'FHA', 'Convencional', 'USDA', 'Jumbo', 'Cash']

const SPECIALTY_LABEL: Record<string, string> = {
  hispanic:    'Familias Hispanas',
  military:    'Familias Militares',
  first_buyer: 'Primeros Compradores',
  brazilian:   'Comunidad Brasileña',
}

const CARD: React.CSSProperties = {
  background:   'var(--bg-surface)',
  border:       '1px solid var(--border-subtle)',
  borderRadius: '12px',
  padding:      '20px',
  marginBottom: '16px',
}

const CARD_TITLE: React.CSSProperties = {
  fontSize: '13px', fontWeight: 500,
  color: 'var(--text-primary)', marginBottom: '16px',
}

// Calculated score breakdown (not events): fit dimensions + component subtotals.
function ScoreBreakdownPanel({ breakdown }: { breakdown: ScoreBreakdown }) {
  const ptsColor = (p: number) => p > 0 ? '#6BA368' : p < 0 ? '#C97B6B' : 'var(--text-muted)'
  const row = (label: string, pts: number, muted = false) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', fontSize: '12px' }}>
      <span style={{ color: muted ? 'var(--text-muted)' : 'var(--text-secondary)' }}>{label}</span>
      <span style={{ color: ptsColor(pts), fontWeight: 600 }}>{pts > 0 ? `+${pts}` : pts}</span>
    </div>
  )
  const sectionTitle = (t: string) => (
    <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginTop: '14px', marginBottom: '2px' }}>{t}</div>
  )
  return (
    <div style={CARD}>
      <div style={CARD_TITLE}>Desglose del score</div>

      {sectionTitle('Fit')}
      {breakdown.hasFitProfile ? (
        breakdown.fit.lines.length > 0
          ? breakdown.fit.lines.map(l => <div key={l.dimension}>{row(l.label, l.points)}</div>)
          : <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '5px 0' }}>Sin dimensiones puntuables.</div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '5px 0', fontStyle: 'italic' }}>Sin datos de perfil aún</div>
      )}
      {row('Subtotal Fit', breakdown.fit.total, true)}

      {sectionTitle('Engagement')}
      {row('Subtotal Engagement', breakdown.engagement.total, true)}
      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
        Las señales positivas pierden valor con el tiempo.
      </div>

      {sectionTitle('Manual')}
      {row('Subtotal Manual', breakdown.manual.total, true)}

      <div style={{ borderTop: '1px solid var(--border-subtle)', marginTop: '14px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Total</span>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{breakdown.total}/100</span>
      </div>
      {breakdown.frozen && (
        <div style={{ fontSize: '11px', color: 'var(--accent-gold)', marginTop: '6px' }}>
          Score congelado por estado.
        </div>
      )}
    </div>
  )
}

const ACTION_BTN_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px',
  width: '100%', textAlign: 'left',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px', padding: '9px 14px',
  fontSize: '13px', cursor: 'pointer',
  color: 'var(--text-secondary)',
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: 'var(--bg-overlay)',
  border: '1px solid var(--border-subtle)', borderRadius: '8px',
  padding: '8px 12px', color: 'var(--text-primary)',
  fontSize: '13px', outline: 'none', boxSizing: 'border-box',
}

const LABEL_STYLE: React.CSSProperties = {
  fontSize: '12px', color: 'var(--text-muted)',
  display: 'block', marginBottom: '6px',
  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
}

const EVENT_ICON_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  lead_created:            { icon: <UserPlus size={14} />,          color: '#5B8EC9' },
  email_opened:            { icon: <Mail size={14} />,              color: '#C9A96E' },
  email_clicked:           { icon: <MousePointer2 size={14} />,     color: '#C9A96E' },
  lm_downloaded:           { icon: <FileDown size={14} />,          color: '#5AAFA0' },
  consultation_scheduled:  { icon: <Calendar size={14} />,          color: '#9B72CF' },
  consultation_attended:   { icon: <CheckCircle2 size={14} />,      color: '#6BA368' },
  reply_received:          { icon: <MessageCircle size={14} />,     color: '#5AAFA0' },
  phone_call:              { icon: <Phone size={14} />,             color: '#5B8EC9' },
  unsubscribed:            { icon: <XCircle size={14} />,           color: '#C97B6B' },
  status_changed:          { icon: <ArrowRightCircle size={14} />,  color: '#9B72CF' },
  score_manual:            { icon: <Activity size={14} />,          color: '#C9A96E' },
}

const DEFAULT_EVENT = { icon: <Circle size={14} />, color: '#C9A96E' }

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
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function LeadDetailClient({ lead, agent, agents, channels, events, submissions, emailReplies, purchaseProcess, manualActions, statusHistory, scoreBreakdown }: LeadDetailProps) {
  const router = useRouter()

  const [currentStatus, setCurrentStatus] = useState<LeadStatus>(lead.status)
  const [notes, setNotes]                 = useState(lead.notes ?? '')
  const [savedNotes, setSavedNotes]       = useState(lead.notes ?? '')
  const [showProcessModal, setShowProcessModal] = useState(false)
  const [modalAddress, setModalAddress]     = useState('')
  const [modalLoanType, setModalLoanType]   = useState('VA Loan')
  const [modalClosingDate, setModalClosingDate] = useState('')
  const [modalNotes, setModalNotes]         = useState('')
  const [showEditModal, setShowEditModal]   = useState(false)
  const [confirmClose, setConfirmClose]     = useState(false)
  const [confirmLost, setConfirmLost]       = useState(false)
  const [actionError, setActionError]       = useState<string | null>(null)
  const [isPending, startTransition]        = useTransition()

  // Delete lead — two-step confirmation
  const [deleteStep,  setDeleteStep]  = useState<0 | 1 | 2>(0)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting,  startDelete]    = useTransition()

  // Clipboard copy feedback (auto-reset after 2 s)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [copiedPhone, setCopiedPhone] = useState(false)

  function handleDeleteConfirm() {
    setDeleteError(null)
    startDelete(async () => {
      const res = await deleteLead(lead.id)
      if (!res.ok) { setDeleteError(res.error); return }
      router.push('/leads')
    })
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing server-prop to local state after router.refresh()
  useEffect(() => { setCurrentStatus(lead.status) }, [lead.status])

  const channel    = channels.find(c => c.id === lead.acquisitionChannelId)
  const leadSource = getLeadSource(channel?.channelType ?? null, lead.trafficSource ?? null)
  const langCfg    = LANGUAGE_CONFIG[lead.language]
  const initials  = getInitials(lead.firstName, lead.lastName)

  const isProcessActive = currentStatus === 'process_started' || currentStatus === 'process_completed'
  const scoreColor = (s: number) => s >= 60 ? '#E04040' : s >= 35 ? '#E07B3A' : '#C9A96E'
  // Primary: status-based freeze; null score is a DB consequence of closed/lost
  const isFrozen = lead.temperatureScore === null || FROZEN_STATUSES.includes(currentStatus)

  const infoRows = [
    { label: 'Nombre',      value: `${lead.firstName} ${lead.lastName}` },
    { label: 'Email',       value: lead.email },
    { label: 'Teléfono',    value: lead.phone || '—' },
    { label: 'Idioma',      value: `${langCfg.flag} ${langCfg.label}` },
    { label: 'Registrado',  value: formatFullDate(lead.createdAt) },
    { label: 'Prestamista', value: lead.lender || '—' },
	{ label: 'Última act.', value: formatFullDate(lead.updatedAt) },
  ]

  return (
    <div style={{ padding: '24px' }}>
      <style>{`
        .back-btn:hover   { color: var(--text-secondary) !important; }
        .action-btn       { transition: border-color 150ms, color 150ms; }
        .action-btn:hover { border-color: var(--border-accent) !important; color: var(--text-primary) !important; }
        .notes-area:focus { border-color: var(--border-accent) !important; outline: none; }
        .modal-input:focus { border-color: var(--border-accent) !important; outline: none; }
      `}</style>

      {/* ── Header ── */}
      <div style={{ marginBottom: '24px' }}>
        <button
          onClick={() => router.back()}
          className="back-btn"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-muted)', fontSize: '13px', padding: '0 0 12px 0',
          }}
        >
          <ArrowLeft size={14} /> Volver a Leads
        </button>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          {/* Lead identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '50%',
              background: agent ? `${agent.accentColor}26` : 'rgba(255,255,255,0.08)',
              color: agent?.accentColor ?? 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', fontWeight: 500, flexShrink: 0,
            }}>
              {initials}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {lead.firstName} {lead.lastName}
                </span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center',
                  padding: '3px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                  background: STATUS_CONFIG[currentStatus].bgColor,
                  color:      STATUS_CONFIG[currentStatus].color,
                  border:     `1px solid ${STATUS_CONFIG[currentStatus].color}40`,
                }}>
                  {STATUS_CONFIG[currentStatus].label}
                </span>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{lead.email}</span>
                {lead.phone && <><span>·</span><span>{lead.phone}</span></>}
                <span>·</span>
                <span>{langCfg.flag} {langCfg.label}</span>
              </div>
            </div>
          </div>

          {/* Header actions */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button
              onClick={() => setShowEditModal(true)}
              style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                cursor: 'pointer', color: 'var(--text-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Editar lead"
            >
              <MoreHorizontal size={16} />
            </button>
            <button
              onClick={() => { setDeleteStep(1); setDeleteInput(''); setDeleteError(null) }}
              style={{
                width: '32px', height: '32px', borderRadius: '8px',
                background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.25)',
                cursor: 'pointer', color: 'var(--accent-coral)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
              title="Eliminar lead"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>

        {/* ── LEFT COLUMN ── */}
        <div>

          {/* Card 1: Lead info */}
          <div style={CARD}>
            <div style={CARD_TITLE}>Información del lead</div>
            {infoRows.map((row, idx) => (
              <div
                key={row.label}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 0',
                  borderBottom: idx < infoRows.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                }}
              >
                <span style={{
                  fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  width: '140px', flexShrink: 0,
                }}>
                  {row.label}
                </span>
                <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1, textAlign: 'right' }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Card 2: Temperature */}
          <div style={CARD}>
            <div style={CARD_TITLE}>Temperatura del lead</div>

            {isFrozen ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Score congelado — lead {STATUS_CONFIG[currentStatus].label.toLowerCase()}
              </div>
            ) : (
              <>
                {/* 10 large pills */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <div key={i} style={{
                      flex: 1, height: '12px', borderRadius: '3px',
                      background: i < Math.round((lead.temperatureScore ?? 0) / 10)
                        ? scoreColor(lead.temperatureScore ?? 0)
                        : 'var(--bg-overlay)',
                    }} />
                  ))}
                </div>

                {/* Continuous bar */}
                <div style={{ width: '100%', height: '6px', background: 'var(--bg-overlay)', borderRadius: '3px', marginBottom: '8px' }}>
                  <div style={{
                    width: `${lead.temperatureScore ?? 0}%`, height: '100%',
                    background: scoreColor(lead.temperatureScore ?? 0), borderRadius: '3px',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: scoreColor(lead.temperatureScore ?? 0) }}>
                    {(lead.temperatureScore ?? 0) >= 60 ? 'Caliente' : (lead.temperatureScore ?? 0) >= 35 ? 'Tibio' : 'Frío'}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Score {lead.temperatureScore ?? 0}/100
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Card: Score breakdown */}
          <ScoreBreakdownPanel breakdown={scoreBreakdown} />

          {/* Card 3: Notes */}
          <div style={CARD}>
            <div style={CARD_TITLE}>Notas</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Agrega notas sobre este lead..."
              className="notes-area"
              style={{
                width: '100%', resize: 'none',
                background: 'var(--bg-overlay)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px', padding: '10px 12px',
                color: 'var(--text-primary)', fontSize: '13px',
                fontFamily: 'inherit', lineHeight: 1.5, boxSizing: 'border-box',
              }}
            />
            {notes !== savedNotes && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  onClick={() => {
                    startTransition(async () => {
                      setActionError(null)
                      const res = await updateLeadNotes(lead.id, notes)
                      if (res.ok) setSavedNotes(notes)
                    })
                  }}
                  disabled={isPending}
                  style={{
                    background: 'var(--accent-gold)', color: 'var(--bg-base)',
                    border: 'none', borderRadius: '6px',
                    padding: '6px 14px', fontSize: '12px', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Guardar nota
                </button>
              </div>
            )}
          </div>

          {/* Card 4: Process */}
          <div style={{ ...CARD, marginBottom: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Proceso de Compra</div>
              {isProcessActive && (
                <span style={{
                  fontSize: '11px', padding: '2px 8px', borderRadius: '4px',
                  background: STATUS_CONFIG[currentStatus].bgColor,
                  color: STATUS_CONFIG[currentStatus].color,
                }}>
                  {STATUS_CONFIG[currentStatus].label}
                </span>
              )}
            </div>

            {(currentStatus === 'closed' || currentStatus === 'lost') && (
              <div style={{
                marginBottom: '12px', padding: '8px 12px', borderRadius: '6px',
                background: 'rgba(201,123,107,0.08)', border: '1px solid rgba(201,123,107,0.2)',
                fontSize: '12px', color: 'var(--text-muted)',
              }}>
                Proceso deshabilitado — lead cerrado.
              </div>
            )}
            <div style={{
              opacity: currentStatus === 'closed' || currentStatus === 'lost' ? 0.4 : 1,
              pointerEvents: currentStatus === 'closed' || currentStatus === 'lost' ? 'none' : 'auto',
            }}>
              {isProcessActive ? (
                <>
                  {[
                    { label: 'Propiedad',   value: purchaseProcess?.address    ?? '—' },
                    { label: 'Tipo loan',   value: purchaseProcess?.loanType   ?? '—' },
                    { label: 'Inicio',      value: purchaseProcess?.createdAt  ? formatFullDate(purchaseProcess.createdAt) : '—' },
                    { label: 'Cierre est.', value: purchaseProcess?.closingDate ? formatFullDate(purchaseProcess.closingDate) : '—' },
                  ].map((row, idx, arr) => (
                    <div
                      key={row.label}
                      style={{
                        display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                        borderBottom: idx < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', width: '100px' }}>{row.label}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{row.value}</span>
                    </div>
                  ))}

                  {currentStatus === 'process_started' && (
                    <button
                      onClick={() => {
                        startTransition(async () => {
                          setActionError(null)
                          const res = await updateLeadStatus(lead.id, 'process_completed')
                          if (res.ok) setCurrentStatus('process_completed')
                          else setActionError(res.error)
                        })
                      }}
                      style={{
                        width: '100%', padding: '8px 16px',
                        background: 'rgba(107,163,104,0.12)', color: '#6BA368',
                        border: '1px solid rgba(107,163,104,0.3)',
                        borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
                      }}
                    >
                      Marcar como Completado
                    </button>
                  )}
                </>
              ) : (
                <>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: 1.5 }}>
                    Este lead aún no tiene un proceso de compra activo.
                  </p>
                  <button
                    onClick={() => setShowProcessModal(true)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      padding: '8px 16px', fontSize: '13px',
                      background: 'rgba(201,169,110,0.08)',
                      border: '1px solid var(--accent-gold)',
                      color: 'var(--accent-gold)',
                      borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    + Iniciar proceso de compra
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div>

          {/* Agent card */}
          <div style={CARD}>
            <div style={CARD_TITLE}>Agente asignado</div>
            {agent ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%',
                    background: `${agent.accentColor}26`, color: agent.accentColor,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '14px', fontWeight: 600, flexShrink: 0,
                  }}>
                    {agent.avatarInitials}
                  </div>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{SPECIALTY_LABEL[agent.specialty]}</div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>{agent.email}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{agent.phone ?? '—'}</div>
              </>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sin agente asignado</div>
            )}
          </div>

          {/* Source card — composite source: channel type takes priority over traffic_source
              (same model as /leads column and analytics donut). */}
          <div style={CARD}>
            <div style={CARD_TITLE}>Origen del lead</div>
            {leadSource.label === '—' ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>Origen no registrado</div>
            ) : (
              <>
                <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: channel ? '2px' : '14px' }}>
                  {leadSource.label}
                </div>
                {channel && (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    {channel.name}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                  Registrado
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{formatDateTime(lead.createdAt)}</div>
              </>
            )}
          </div>

          {/* Quick actions card */}
          <div style={{ ...CARD, marginBottom: 0 }}>
            <div style={CARD_TITLE}>Acciones</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {/* Mailto — opens the agent's personal email client. No server send, no Resend. */}
              <a
                href={`mailto:${lead.email}?subject=${encodeURIComponent(`${lead.firstName} ${lead.lastName}`)}`}
                className="action-btn"
                style={{ ...ACTION_BTN_STYLE, textDecoration: 'none', minHeight: '40px' }}
              >
                <Mail size={14} /> Enviar email
              </a>
              {/* Copy email — always visible */}
              <button
                onClick={() => {
                  void navigator.clipboard.writeText(lead.email)
                  setCopiedEmail(true)
                  setTimeout(() => setCopiedEmail(false), 2000)
                }}
                className="action-btn"
                style={{
                  ...ACTION_BTN_STYLE,
                  minHeight: '40px',
                  ...(copiedEmail && { color: 'var(--accent-green)', borderColor: 'rgba(107,163,104,0.3)' }),
                }}
              >
                {copiedEmail ? <Check size={14} /> : <Copy size={14} />}
                {copiedEmail ? 'Copiado' : 'Copiar email'}
              </button>
              {/* Copy phone — only when the lead has a phone number */}
              {lead.phone && (
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(lead.phone!)
                    setCopiedPhone(true)
                    setTimeout(() => setCopiedPhone(false), 2000)
                  }}
                  className="action-btn"
                  style={{
                    ...ACTION_BTN_STYLE,
                    minHeight: '40px',
                    ...(copiedPhone && { color: 'var(--accent-green)', borderColor: 'rgba(107,163,104,0.3)' }),
                  }}
                >
                  {copiedPhone ? <Check size={14} /> : <Copy size={14} />}
                  {copiedPhone ? 'Copiado' : 'Copiar teléfono'}
                </button>
              )}

              {/* Marcar como Cerrado — inline confirm */}
              {confirmClose ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => {
                      setConfirmClose(false)
                      startTransition(async () => {
                        setActionError(null)
                        const res = await updateLeadStatus(lead.id, 'closed')
                        if (res.ok) setCurrentStatus('closed')
                        else setActionError(res.error)
                      })
                    }}
                    style={{
                      flex: 1, padding: '9px 14px', fontSize: '13px', fontWeight: 500,
                      background: 'rgba(74,155,107,0.1)', color: '#4A9B6B',
                      border: '1px solid rgba(74,155,107,0.3)', borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    ¿Confirmar cierre?
                  </button>
                  <button
                    onClick={() => setConfirmClose(false)}
                    style={{
                      padding: '9px 12px', fontSize: '13px',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmClose(true)}
                  disabled={currentStatus === 'closed' || currentStatus === 'lost'}
                  className="action-btn"
                  style={{
                    ...ACTION_BTN_STYLE,
                    opacity: currentStatus === 'closed' || currentStatus === 'lost' ? 0.4 : 1,
                    cursor: currentStatus === 'closed' || currentStatus === 'lost' ? 'not-allowed' : 'pointer',
                  }}
                >
                  <XCircle size={14} style={{ color: '#4A9B6B' }} /> Marcar como Cerrado
                </button>
              )}

              {/* Marcar como Perdido — inline confirm */}
              {confirmLost ? (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => {
                      setConfirmLost(false)
                      startTransition(async () => {
                        setActionError(null)
                        const res = await updateLeadStatus(lead.id, 'lost')
                        if (res.ok) setCurrentStatus('lost')
                        else setActionError(res.error)
                      })
                    }}
                    style={{
                      flex: 1, padding: '9px 14px', fontSize: '13px', fontWeight: 500,
                      background: 'rgba(201,123,107,0.1)', color: '#C97B6B',
                      border: '1px solid rgba(201,123,107,0.3)', borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    ¿Confirmar pérdida?
                  </button>
                  <button
                    onClick={() => setConfirmLost(false)}
                    style={{
                      padding: '9px 12px', fontSize: '13px',
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                      color: 'var(--text-muted)', borderRadius: '8px', cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmLost(true)}
                  disabled={currentStatus === 'closed' || currentStatus === 'lost'}
                  className="action-btn"
                  style={{
                    ...ACTION_BTN_STYLE, color: 'rgba(201,123,107,0.7)',
                    opacity: currentStatus === 'closed' || currentStatus === 'lost' ? 0.4 : 1,
                    cursor: currentStatus === 'closed' || currentStatus === 'lost' ? 'not-allowed' : 'pointer',
                  }}
                >
                  <XCircle size={14} /> Marcar como Perdido
                </button>
              )}
            </div>

            {actionError && (
              <p style={{ fontSize: '12px', color: '#C97B6B', marginTop: '8px' }}>{actionError}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Manual actions panel ── */}
      <ManualActionsPanel
        leadId={lead.id}
        currentStatus={currentStatus}
        actions={manualActions}
      />

      {/* ── Formularios completados ── */}
      <LeadSubmissionsList submissions={submissions} />

      {/* ── Respuestas por email ── */}
      <LeadEmailRepliesList replies={emailReplies} />

      {/* ── Historial de estados ── */}
      <StatusHistoryTimeline changes={statusHistory} />

      {/* ── Timeline ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px 24px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Historial de actividad</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{events.length} eventos</span>
        </div>

        {events.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Sin actividad registrada todavía.
          </p>
        ) : (
          <div style={{ position: 'relative' }}>
            <div style={{ position: 'absolute', left: '13px', top: '14px', bottom: '14px', width: '2px', background: 'var(--border-subtle)' }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {events.map(event => {
                const { icon, color } = EVENT_ICON_MAP[event.type] ?? DEFAULT_EVENT
                return (
                  <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '16px' }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      background: `${color}1F`, color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, position: 'relative', zIndex: 1,
                    }}>
                      {icon}
                    </div>
                    <div style={{ flex: 1, paddingTop: '5px' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4, flex: 1 }}>
                          {event.description}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          {event.points !== null && event.points !== 0 && (
                            <span style={{
                              fontSize: '11px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px',
                              background: event.points > 0 ? 'rgba(107,163,104,0.12)' : 'rgba(201,123,107,0.12)',
                              color: event.points > 0 ? '#6BA368' : '#C97B6B',
                            }}>
                              {event.points > 0 ? `+${event.points}` : event.points} pts
                            </span>
                          )}
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                            {event.author ? `${event.author} · ` : ''}{formatDateTime(event.createdAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── Modal: Edit Lead ── */}
      <EditLeadModal
        lead={lead}
        agents={agents}
        channels={channels}
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
      />

      {/* ── Modal: Iniciar proceso ── */}
      <ModalShell open={showProcessModal} onClose={() => setShowProcessModal(false)} maxWidth={480}>
          <div style={{ padding: '24px' }}>
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Iniciar proceso de compra</div>
              <button
                onClick={() => setShowProcessModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
              Lead: {lead.firstName} {lead.lastName}
            </div>

            {/* Form fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
              <div>
                <label style={LABEL_STYLE}>Dirección de la propiedad</label>
                <input
                  type="text"
                  value={modalAddress}
                  onChange={e => setModalAddress(e.target.value)}
                  placeholder="123 Ocean View Dr, Norfolk, VA"
                  className="modal-input"
                  style={INPUT_STYLE}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Tipo de préstamo</label>
                <select
                  value={modalLoanType}
                  onChange={e => setModalLoanType(e.target.value)}
                  className="modal-input"
                  style={{ ...INPUT_STYLE, appearance: 'none', cursor: 'pointer' }}
                >
                  {LOAN_TYPES.map(lt => (
                    <option key={lt} value={lt} style={{ background: '#16181C' }}>{lt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={LABEL_STYLE}>Fecha estimada de cierre <span style={{ color: 'var(--accent-coral)' }}>*</span></label>
                <input
                  type="date"
                  value={modalClosingDate}
                  onChange={e => setModalClosingDate(e.target.value)}
                  required
                  min={new Date().toISOString().slice(0, 10)}
                  className="modal-input"
                  style={{ ...INPUT_STYLE, colorScheme: 'dark' }}
                />
              </div>
              <div>
                <label style={LABEL_STYLE}>Notas internas</label>
                <textarea
                  value={modalNotes}
                  onChange={e => setModalNotes(e.target.value)}
                  rows={3}
                  placeholder="Detalles del proceso..."
                  className="modal-input"
                  style={{ ...INPUT_STYLE, resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
                />
              </div>
            </div>

            {/* Modal actions */}
            {actionError && (
              <p style={{ fontSize: '12px', color: '#C97B6B', marginBottom: '8px' }}>{actionError}</p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setShowProcessModal(false)}
                style={{
                  padding: '8px 16px', fontSize: '13px', borderRadius: '8px',
                  background: 'transparent', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-muted)', cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  startTransition(async () => {
                    setActionError(null)
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
                    }
                  })
                }}
                disabled={isPending}
                style={{
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: 'var(--accent-gold)', color: 'var(--bg-base)',
                  border: 'none', cursor: 'pointer',
                }}
              >
                Iniciar proceso →
              </button>
            </div>
          </div>
      </ModalShell>

      {/* ── Modal: Eliminar lead — Step 1: first confirmation ── */}
      <ModalShell open={deleteStep === 1} onClose={() => setDeleteStep(0)} maxWidth={440}>
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-primary)' }}>Eliminar lead</span>
              <button onClick={() => setDeleteStep(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: '20px' }}>
              ¿Estás seguro de eliminar a <strong style={{ color: 'var(--text-primary)' }}>{lead.firstName} {lead.lastName}</strong>?
              Esta acción eliminará todos sus eventos, runs de secuencia y notificaciones relacionadas.{' '}
              <strong style={{ color: 'var(--accent-coral)' }}>No se puede deshacer.</strong>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setDeleteStep(0)} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => { setDeleteStep(2); setDeleteInput('') }} style={{
                padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                background: 'rgba(201,123,107,0.15)', color: 'var(--accent-coral)',
                border: '1px solid rgba(201,123,107,0.3)', cursor: 'pointer',
              }}>Continuar →</button>
            </div>
          </div>
      </ModalShell>

      {/* ── Modal: Eliminar lead — Step 2: type confirmation ── */}
      <ModalShell open={deleteStep === 2} onClose={() => setDeleteStep(0)} maxWidth={420}>
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--accent-coral)' }}>Confirmar eliminación</span>
              <button onClick={() => setDeleteStep(0)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={18} /></button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '14px' }}>
              Para confirmar, escribe <strong style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>ELIMINAR</strong> en el campo:
            </p>
            <input
              value={deleteInput}
              onChange={e => setDeleteInput(e.target.value)}
              placeholder="ELIMINAR"
              autoFocus
              style={{
                width: '100%', background: 'var(--bg-overlay)',
                border: '1px solid rgba(201,123,107,0.3)', borderRadius: '8px',
                padding: '9px 12px', color: 'var(--text-primary)', fontSize: '14px',
                outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace',
                marginBottom: '16px',
              }}
            />
            {deleteError && (
              <div style={{ fontSize: '12px', color: 'var(--status-hot)', marginBottom: '12px', padding: '6px 10px', background: 'color-mix(in srgb, var(--status-hot) 8%, transparent)', borderRadius: '6px' }}>
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button onClick={() => setDeleteStep(0)} style={{ padding: '8px 16px', fontSize: '13px', borderRadius: '8px', background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}>Cancelar</button>
              <button
                onClick={handleDeleteConfirm}
                disabled={deleteInput !== 'ELIMINAR' || isDeleting}
                style={{
                  padding: '8px 20px', fontSize: '13px', fontWeight: 500, borderRadius: '8px',
                  background: deleteInput === 'ELIMINAR' ? 'rgba(201,123,107,0.2)' : 'var(--bg-elevated)',
                  color: deleteInput === 'ELIMINAR' ? 'var(--accent-coral)' : 'var(--text-muted)',
                  border: deleteInput === 'ELIMINAR' ? '1px solid rgba(201,123,107,0.4)' : '1px solid var(--border-subtle)',
                  cursor: (deleteInput !== 'ELIMINAR' || isDeleting) ? 'not-allowed' : 'pointer',
                  opacity: isDeleting ? 0.7 : 1,
                }}
              >
                {isDeleting ? 'Eliminando...' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
      </ModalShell>
    </div>
  )
}
