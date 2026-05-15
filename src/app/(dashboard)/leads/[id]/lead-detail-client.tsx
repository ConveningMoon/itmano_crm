'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { STATUS_CONFIG, SOURCE_CONFIG, LANGUAGE_CONFIG } from '@/lib/config'
import type { Lead, Agent, LeadSource, LeadEvent, LeadStatus } from '@/lib/types'
import {
  ArrowLeft, MoreHorizontal, ChevronDown, X,
  UserPlus, Mail, FileDown, MousePointer2, Calendar,
  ArrowRightCircle, CheckCircle2, Circle,
  TrendingUp, TrendingDown,
  MessageCircle, Flame, XCircle,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface TimelineEvent {
  id: string
  type: string
  icon: string
  color: string
  description: string
  date: string
}

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

function tempColor(score: number): string {
  if (score >= 70) return '#E04040'
  if (score >= 40) return '#E07B3A'
  return '#C9A96E'
}

function tempLabel(score: number): string {
  if (score >= 70) return 'Caliente'
  if (score >= 40) return 'Tibio'
  return 'Frío'
}

function getInitials(firstName: string, lastName: string): string {
  const f = firstName.charAt(0)
  const l = lastName.charAt(0)
  return (f + l).toUpperCase() || f.toUpperCase()
}

function generateMockEvents(lead: Lead, sourceName: string): TimelineEvent[] {
  const events: TimelineEvent[] = []
  const base = new Date(lead.createdAt)

  events.push({
    id: '1', type: 'created', icon: 'UserPlus', color: '#5B8EC9',
    description: `Lead registrado desde ${sourceName}`,
    date: lead.createdAt,
  })

  if (lead.temperatureScore > 10) {
    const d = new Date(base); d.setDate(d.getDate() + 1)
    events.push({
      id: '2', type: 'email_opened', icon: 'Mail', color: '#C9A96E',
      description: 'Abrió el email de bienvenida de la secuencia',
      date: d.toISOString(),
    })
  }

  if (lead.temperatureScore > 25) {
    const d = new Date(base); d.setDate(d.getDate() + 2)
    events.push({
      id: '3', type: 'lm_downloaded', icon: 'FileDown', color: '#5AAFA0',
      description: `Descargó "${sourceName}"`,
      date: d.toISOString(),
    })
  }

  if (lead.temperatureScore > 40) {
    const d = new Date(base); d.setDate(d.getDate() + 5)
    events.push({
      id: '4', type: 'email_clicked', icon: 'MousePointer2', color: '#C9A96E',
      description: 'Hizo click en el CTA de la secuencia de email',
      date: d.toISOString(),
    })
  }

  if (lead.temperatureScore > 60) {
    const d = new Date(base); d.setDate(d.getDate() + 8)
    events.push({
      id: '5', type: 'consultation', icon: 'Calendar', color: '#9B72CF',
      description: 'Agendó consulta gratuita con el agente',
      date: d.toISOString(),
    })
  }

  if (['process_started', 'process_completed', 'closed'].includes(lead.status)) {
    const d = new Date(base); d.setDate(d.getDate() + 14)
    events.push({
      id: '6', type: 'status_changed', icon: 'ArrowRightCircle', color: '#9B72CF',
      description: 'Proceso de compra iniciado. Email de inicio enviado automáticamente.',
      date: d.toISOString(),
    })
  }

  if (['process_completed', 'closed'].includes(lead.status)) {
    const d = new Date(base); d.setDate(d.getDate() + 45)
    events.push({
      id: '7', type: 'completed', icon: 'CheckCircle2', color: '#6BA368',
      description: 'Proceso completado. Email de cierre enviado. Reseña solicitada.',
      date: d.toISOString(),
    })
  }

  return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

// ─── Icon renderer for timeline ───────────────────────────────────────────────

function TLIcon({ name }: { name: string }) {
  const p = { size: 14 }
  switch (name) {
    case 'UserPlus':         return <UserPlus {...p} />
    case 'Mail':             return <Mail {...p} />
    case 'FileDown':         return <FileDown {...p} />
    case 'MousePointer2':    return <MousePointer2 {...p} />
    case 'Calendar':         return <Calendar {...p} />
    case 'ArrowRightCircle': return <ArrowRightCircle {...p} />
    case 'CheckCircle2':     return <CheckCircle2 {...p} />
    default:                 return null
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PROCESS_STEPS = [
  { label: 'Oferta aceptada',            done: true },
  { label: 'Inspección completada',       done: true },
  { label: 'Aprobación del préstamo',    done: false },
  { label: 'Fecha de cierre confirmada', done: false },
  { label: 'Cierre',                     done: false },
]

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

// ─── Props ────────────────────────────────────────────────────────────────────

interface LeadDetailProps {
  lead: Lead
  agent: Agent | undefined
  source: LeadSource | undefined
  events: LeadEvent[]
}

// ─── Main Component ────────────────────────────────────────────────────────────

export function LeadDetailClient({ lead, agent, source, events }: LeadDetailProps) {
  const router = useRouter()

  const [currentStatus, setCurrentStatus] = useState<LeadStatus>(lead.status)
  const [notes, setNotes]                 = useState(lead.notes ?? '')
  const [savedNotes, setSavedNotes]       = useState(lead.notes ?? '')
  const [localTempScore, setLocalTempScore] = useState(lead.temperatureScore)
  const [showProcessModal, setShowProcessModal] = useState(false)
  const [modalAddress, setModalAddress]     = useState('')
  const [modalLoanType, setModalLoanType]   = useState('VA Loan')
  const [modalClosingDate, setModalClosingDate] = useState('')
  const [modalNotes, setModalNotes]         = useState('')

  const sourceCfg = source ? SOURCE_CONFIG[source.type] : null
  const langCfg   = LANGUAGE_CONFIG[lead.language]
  const initials  = getInitials(lead.firstName, lead.lastName)

  const sourceName = source?.name ?? 'fuente desconocida'
  const STATIC_EVENTS = generateMockEvents(lead, sourceName)
  const displayEvents: TimelineEvent[] = events.length > 0
    ? events.map(e => ({ id: e.id, type: e.type, icon: 'Circle', color: '#C9A96E', description: e.description, date: e.createdAt }))
    : STATIC_EVENTS

  const tColor    = tempColor(localTempScore)
  const filledPills = Math.round(localTempScore / 10)
  const isProcessActive = currentStatus === 'process_started' || currentStatus === 'process_completed'

  const scoringFactors = [
    { label: 'Abrió 3 emails',       points: '+30', active: localTempScore > 20,  positive: true },
    { label: 'Descargó 2 guías',     points: '+35', active: localTempScore > 50,  positive: true },
    { label: 'Agendó consulta',      points: '+30', active: localTempScore > 70,  positive: true },
    { label: 'Sin actividad 7 días', points: '-10', active: localTempScore < 30,  positive: false },
  ].filter(f => f.active)

  const infoRows = [
    { label: 'Nombre',      value: `${lead.firstName} ${lead.lastName}` },
    { label: 'Email',       value: lead.email },
    { label: 'Teléfono',    value: lead.phone || '—' },
    { label: 'Idioma',      value: `${langCfg.flag} ${langCfg.label}` },
    { label: 'Registrado',  value: formatFullDate(lead.createdAt) },
    { label: 'Última act.', value: formatFullDate(lead.updatedAt) },
  ]

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
              <div style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '4px' }}>
                {lead.firstName} {lead.lastName}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <span>{lead.email}</span>
                {lead.phone && <><span>·</span><span>{lead.phone}</span></>}
                <span>·</span>
                <span>{langCfg.flag} {langCfg.label}</span>
              </div>
            </div>
          </div>

          {/* Status select + more button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                value={currentStatus}
                onChange={e => setCurrentStatus(e.target.value as LeadStatus)}
                style={{
                  background:   STATUS_CONFIG[currentStatus].bgColor,
                  color:        STATUS_CONFIG[currentStatus].color,
                  border:       `1px solid ${STATUS_CONFIG[currentStatus].color}50`,
                  borderRadius: '8px',
                  padding:      '6px 32px 6px 12px',
                  fontSize:     '13px', fontWeight: 500, cursor: 'pointer',
                  appearance:   'none',
                }}
              >
                {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key} style={{ background: '#16181C', color: cfg.color }}>
                    {cfg.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={14}
                style={{ position: 'absolute', right: '10px', color: STATUS_CONFIG[currentStatus].color, pointerEvents: 'none' }}
              />
            </div>
            <button style={{
              width: '32px', height: '32px', borderRadius: '8px',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              cursor: 'pointer', color: 'var(--text-muted)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MoreHorizontal size={16} />
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

            {/* 10 large pills */}
            <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
              {Array.from({ length: 10 }, (_, i) => (
                <div key={i} style={{
                  flex: 1, height: '12px', borderRadius: '3px',
                  background: i < filledPills ? tColor : 'var(--bg-overlay)',
                }} />
              ))}
            </div>

            {/* Continuous bar */}
            <div style={{ width: '100%', height: '6px', background: 'var(--bg-overlay)', borderRadius: '3px', marginBottom: '8px' }}>
              <div style={{ width: `${localTempScore}%`, height: '100%', background: tColor, borderRadius: '3px' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: scoringFactors.length > 0 ? '16px' : '0' }}>
              <span style={{ fontSize: '12px', color: tColor }}>{tempLabel(localTempScore)}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Score {localTempScore}/100</span>
            </div>

            {scoringFactors.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {scoringFactors.map((f, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {f.positive
                      ? <TrendingUp  size={14} style={{ color: '#6BA368', flexShrink: 0 }} />
                      : <TrendingDown size={14} style={{ color: '#C97B6B', flexShrink: 0 }} />
                    }
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flex: 1 }}>{f.label}</span>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: f.positive ? '#6BA368' : '#C97B6B' }}>{f.points}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                  onClick={() => setSavedNotes(notes)}
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

            {isProcessActive ? (
              <>
                {[
                  { label: 'Propiedad',   value: '123 Ocean View Dr, Norfolk' },
                  { label: 'Tipo loan',   value: 'VA Loan' },
                  { label: 'Inicio',      value: '1 Abr 2026' },
                  { label: 'Cierre est.', value: '30 May 2026' },
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

                <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', margin: '16px 0 10px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Pasos del proceso
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: currentStatus === 'process_started' ? '16px' : '0' }}>
                  {PROCESS_STEPS.map((step, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {step.done
                        ? <CheckCircle2 size={16} style={{ color: '#6BA368', flexShrink: 0 }} />
                        : <Circle       size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      }
                      <span style={{ fontSize: '13px', color: step.done ? 'var(--text-primary)' : 'var(--text-muted)' }}>
                        {step.label}
                      </span>
                    </div>
                  ))}
                </div>

                {currentStatus === 'process_started' && (
                  <button
                    onClick={() => setCurrentStatus('process_completed')}
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
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>{agent.phone ?? '—'}</div>
                <button style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', fontSize: '12px',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)', borderRadius: '6px', cursor: 'pointer',
                }}>
                  <Calendar size={13} /> Ver Calendly
                </button>
              </>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Sin agente asignado</div>
            )}
          </div>

          {/* Source card */}
          <div style={CARD}>
            <div style={CARD_TITLE}>Origen del lead</div>
            {source && sourceCfg ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '20px' }}>{sourceCfg.icon}</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{sourceCfg.label}</span>
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px' }}>{source.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>
                  Registrado
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{formatDateTime(lead.createdAt)}</div>
              </>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>—</div>
            )}
          </div>

          {/* Quick actions card */}
          <div style={{ ...CARD, marginBottom: 0 }}>
            <div style={CARD_TITLE}>Acciones</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {([
                { icon: <Mail size={14} />,          label: 'Enviar email',         onClick: undefined,                                                     danger: false },
                { icon: <MessageCircle size={14} />, label: 'WhatsApp',             onClick: undefined,                                                     danger: false },
                { icon: <Flame size={14} />,         label: 'Marcar como hot',      onClick: () => { setLocalTempScore(85); setCurrentStatus('hot') },       danger: false },
                { icon: <XCircle size={14} />,       label: 'Marcar como perdido',  onClick: () => setCurrentStatus('lost'),                                  danger: true  },
              ] as { icon: React.ReactNode; label: string; onClick: (() => void) | undefined; danger: boolean }[]).map((btn, i) => (
                <button
                  key={i}
                  onClick={btn.onClick}
                  className="action-btn"
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    width: '100%', textAlign: 'left',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '8px', padding: '9px 14px',
                    fontSize: '13px', cursor: 'pointer',
                    color: btn.danger ? 'rgba(201,123,107,0.7)' : 'var(--text-secondary)',
                  }}
                >
                  {btn.icon} {btn.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Timeline ── */}
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px 24px', marginTop: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>Historial de actividad</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{displayEvents.length} eventos</span>
        </div>

        <div style={{ position: 'relative' }}>
          {/* Vertical connector line */}
          <div style={{
            position: 'absolute', left: '13px', top: '14px', bottom: '14px',
            width: '2px', background: 'var(--border-subtle)',
          }} />

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {displayEvents.map(event => (
              <div key={event.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '16px' }}>
                <div style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: `${event.color}1F`, color: event.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, position: 'relative', zIndex: 1,
                }}>
                  <TLIcon name={event.icon} />
                </div>
                <div style={{ flex: 1, paddingTop: '5px' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {event.description}
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {formatDateTime(event.date)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Modal: Iniciar proceso ── */}
      {showProcessModal && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 50 }}
            onClick={() => setShowProcessModal(false)}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-accent)',
            borderRadius: '16px', padding: '24px',
            width: '480px', maxWidth: '90vw',
            zIndex: 51,
          }}>
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
                <label style={LABEL_STYLE}>Fecha estimada de cierre</label>
                <input
                  type="date"
                  value={modalClosingDate}
                  onChange={e => setModalClosingDate(e.target.value)}
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
                onClick={() => { setShowProcessModal(false); setCurrentStatus('process_started') }}
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
        </>
      )}
    </div>
  )
}
