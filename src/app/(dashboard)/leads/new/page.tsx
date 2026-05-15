'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { MOCK_AGENTS } from '@/lib/mockdata'
import type { Language } from '@/lib/types'
import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  Phone,
  Building2,
  Upload,
  PenLine,
  FileUp,
  Download,
  AlertTriangle,
} from 'lucide-react'

interface FormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  language: Language | ''
  agentId: string
  sourceType: string
  lender: string
  referralName: string
  notes: string
}

interface FormErrors {
  firstName?: string
  email?: string
  agentId?: string
  sourceType?: string
}

type ImportStatus = 'idle' | 'parsing' | 'preview' | 'success' | 'error'

interface ImportedLead {
  firstName: string
  lastName: string
  email: string
  phone: string
  language: string
  agentId: string
  sourceType: string
  lender: string
  notes: string
  _rowIndex: number
  _hasError: boolean
  _errorMessage?: string
}

const INITIAL_FORM: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  language: '',
  agentId: '',
  sourceType: '',
  lender: '',
  referralName: '',
  notes: '',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  padding: '9px 12px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  outline: 'none',
  boxSizing: 'border-box',
}

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: '#E05C5C',
}

const inputWithIconStyle: React.CSSProperties = {
  ...inputStyle,
  paddingLeft: '36px',
}

const inputWithIconErrorStyle: React.CSSProperties = {
  ...inputWithIconStyle,
  borderColor: '#E05C5C',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '6px',
}

const errorStyle: React.CSSProperties = {
  fontSize: '11px',
  color: '#E05C5C',
  marginTop: '4px',
}

const sectionHeaderStyle: React.CSSProperties = {
  padding: '12px 20px',
  borderBottom: '1px solid var(--border-subtle)',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--text-secondary)',
  background: 'var(--bg-elevated)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const sectionBodyStyle: React.CSSProperties = {
  padding: '20px',
  borderBottom: '1px solid var(--border-subtle)',
}

const SPECIALTY_LABEL: Record<string, string> = {
  hispanic: 'Familias Hispanas',
  military: 'Familias Militares',
  first_buyer: 'Compradores Primerizos',
  brazilian: 'Comunidad Brasileña',
}

const LANG_FLAG: Record<string, string> = { es: '🇪🇸', en: '🇺🇸', pt: '🇧🇷' }
const LANG_LABEL: Record<string, string> = { es: 'ES', en: 'EN', pt: 'PT' }

interface SuccessScreenProps {
  form: FormData
  onReset: () => void
}

function SuccessScreen({ form, onReset }: SuccessScreenProps) {
  const router = useRouter()
  const agentName = MOCK_AGENTS.find(a => a.id === form.agentId)?.name || 'el agente'
  const fullName = [form.firstName, form.lastName].filter(Boolean).join(' ')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        textAlign: 'center',
        padding: '24px',
      }}
    >
      <CheckCircle2 size={64} color="var(--accent-gold)" strokeWidth={1.5} />
      <h2 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', margin: '16px 0 8px' }}>
        ¡Lead registrado correctamente!
      </h2>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '320px', lineHeight: 1.6 }}>
        {fullName} ha sido añadido al sistema y asignado a {agentName}.
      </p>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '8px', maxWidth: '280px' }}>
        La secuencia de email se activará automáticamente.
      </p>
      {form.lender && (
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Prestamista: <strong>{form.lender}</strong>
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '28px', width: '200px' }}>
        <button
          onClick={() => router.push('/leads')}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: '1px solid var(--border-subtle)',
            background: 'transparent',
            color: 'var(--text-secondary)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          ← Ver todos los leads
        </button>
        <button
          onClick={onReset}
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--accent-gold)',
            color: 'var(--bg-base)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Registrar otro lead
        </button>
      </div>
    </div>
  )
}

export default function NewLeadPage() {
  const router = useRouter()

  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [autoAssigned, setAutoAssigned] = useState(false)
  const [mode, setMode] = useState<'manual' | 'import'>('manual')
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [importedLeads, setImportedLeads] = useState<ImportedLead[]>([])
  const [importError, setImportError] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function downloadTemplate() {
    const headers = [
      'firstName', 'lastName', 'email', 'phone',
      'language', 'agentId', 'sourceType', 'lender', 'notes',
    ]
    const exampleRow = [
      'María', 'González', 'maria@email.com', '(757) 555-0100',
      'es', 'agent-adriana', 'manual', 'Navy Federal', 'Cliente interesada en Virginia Beach',
    ]
    const notes = [
      '# INSTRUCCIONES:',
      '# language: es | en | pt',
      '# agentId: agent-adriana | agent-john | agent-melanie | agent-viviane',
      '# sourceType: lead_magnet | web_form | open_house | manual | ads | referral',
      '# lender: texto libre (opcional)',
      '# Elimina estas líneas de comentario antes de importar',
      '',
    ]
    const csv = [...notes, headers.join(','), exampleRow.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'plantilla_leads_itmano.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleFileUpload(file: File) {
    setImportStatus('parsing')
    setImportError('')

    const extension = file.name.split('.').pop()?.toLowerCase()

    try {
      let rows: Record<string, string>[] = []

      if (extension === 'csv') {
        await new Promise<void>((resolve, reject) => {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            comments: '#',
            complete: (results) => {
              rows = results.data as Record<string, string>[]
              resolve()
            },
            error: (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
          })
        })
      } else if (extension === 'xlsx') {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false })
      } else {
        throw new Error('Formato no soportado. Usa .csv o .xlsx')
      }

      if (rows.length === 0) {
        throw new Error('El archivo está vacío o no tiene filas de datos')
      }

      if (rows.length > 500) {
        throw new Error(`El archivo tiene ${rows.length} filas. El máximo permitido es 500`)
      }

      const validLanguages = ['es', 'en', 'pt']
      const validAgentIds = MOCK_AGENTS.map(a => a.id)
      const validSourceTypes = ['lead_magnet', 'web_form', 'open_house', 'manual', 'ads', 'referral']

      const mapped: ImportedLead[] = rows.map((row, i) => {
        const errors: string[] = []

        if (!row.firstName?.trim()) errors.push('firstName requerido')
        if (!row.email?.trim()) errors.push('email requerido')
        if (row.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) errors.push('email inválido')
        if (row.language?.trim() && !validLanguages.includes(row.language.trim())) errors.push(`language debe ser: ${validLanguages.join(' | ')}`)
        if (row.agentId?.trim() && !validAgentIds.includes(row.agentId.trim())) errors.push('agentId inválido')
        if (row.sourceType?.trim() && !validSourceTypes.includes(row.sourceType.trim())) errors.push('sourceType inválido')

        return {
          firstName:     row.firstName?.trim()  || '',
          lastName:      row.lastName?.trim()   || '',
          email:         row.email?.trim()      || '',
          phone:         row.phone?.trim()      || '',
          language:      row.language?.trim()   || 'es',
          agentId:       row.agentId?.trim()    || 'agent-adriana',
          sourceType:    row.sourceType?.trim() || 'manual',
          lender:        row.lender?.trim()     || '',
          notes:         row.notes?.trim()      || '',
          _rowIndex:     i + 1,
          _hasError:     errors.length > 0,
          _errorMessage: errors.join(', '),
        }
      })

      setImportedLeads(mapped)
      setImportStatus('preview')

    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Error al procesar el archivo')
      setImportStatus('error')
    }
  }

  const updateField = (field: keyof FormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
    if (field in errors) {
      setErrors(prev => ({ ...prev, [field]: undefined }))
    }
  }

  const handleLanguageChange = (lang: Language) => {
    updateField('language', lang)
    if (!form.agentId) {
      const agentMap: Record<Language, string> = {
        es: 'agent-adriana',
        en: 'agent-john',
        pt: 'agent-viviane',
      }
      updateField('agentId', agentMap[lang])
      setAutoAssigned(true)
    }
  }

  const handleAgentChange = (agentId: string) => {
    updateField('agentId', agentId)
    setAutoAssigned(false)
    if (errors.agentId) setErrors(prev => ({ ...prev, agentId: undefined }))
  }

  const validate = (): boolean => {
    const newErrors: FormErrors = {}
    if (!form.firstName.trim()) newErrors.firstName = 'El nombre es obligatorio'
    if (!form.email.trim()) {
      newErrors.email = 'El email es obligatorio'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Email no válido'
    }
    if (!form.agentId) newErrors.agentId = 'Selecciona un agente'
    if (!form.sourceType) newErrors.sourceType = 'Selecciona el origen'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = () => {
    if (!validate()) return
    setSubmitted(true)
  }

  const handleReset = () => {
    setForm(INITIAL_FORM)
    setErrors({})
    setAutoAssigned(false)
    setSubmitted(false)
  }

  const selectedAgent = MOCK_AGENTS.find(a => a.id === form.agentId)
  const isSubmitDisabled = !form.firstName.trim() || !form.email.trim()

  if (submitted) return <SuccessScreen form={form} onReset={handleReset} />

  return (
    <>
      <style>{`
        .new-lead-input:focus { border-color: var(--accent-gold) !important; }
        .cancel-btn:hover { color: var(--text-secondary) !important; }
        .submit-btn:not(:disabled):hover { opacity: 0.88; }
        .back-btn:hover { color: var(--text-secondary) !important; }
      `}</style>

      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '0 0 48px' }}>
        {/* Header */}
        <div style={{ marginBottom: '24px' }}>
          <button
            className="back-btn"
            onClick={() => router.back()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '0',
            }}
          >
            <ArrowLeft size={14} />
            Volver a Leads
          </button>
          <h1 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-primary)', marginTop: '16px', marginBottom: '4px' }}>
            Registrar nuevo lead
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
            Completa los datos del lead para añadirlo al sistema
          </p>
        </div>

        {/* Mode tabs */}
        <div style={{
          display: 'flex',
          gap: '4px',
          marginBottom: '24px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '10px',
          padding: '4px',
          maxWidth: '400px',
        }}>
          {(['manual', 'import'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1,
                padding: '8px 16px',
                borderRadius: '7px',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: mode === m ? 500 : 400,
                background: mode === m ? 'var(--bg-elevated)' : 'transparent',
                color: mode === m ? 'var(--text-primary)' : 'var(--text-muted)',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {m === 'manual'
                ? <><PenLine size={14} /> Registro Manual</>
                : <><Upload size={14} /> Importar CSV/XLSX</>
              }
            </button>
          ))}
        </div>

        {mode === 'manual' && (
          <>
        {/* Form card */}
        <div style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: '16px',
          overflow: 'hidden',
        }}>

          {/* SECCIÓN 1 — Datos del lead */}
          <div style={sectionHeaderStyle}>Datos del lead</div>
          <div style={{ ...sectionBodyStyle }}>
            {/* Nombre / Apellido */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={labelStyle}>Nombre *</label>
                <input
                  className="new-lead-input"
                  type="text"
                  placeholder="Ej. María"
                  value={form.firstName}
                  onChange={e => updateField('firstName', e.target.value)}
                  style={errors.firstName ? inputErrorStyle : inputStyle}
                />
                {errors.firstName && <p style={errorStyle}>{errors.firstName}</p>}
              </div>
              <div>
                <label style={labelStyle}>Apellido</label>
                <input
                  className="new-lead-input"
                  type="text"
                  placeholder="Ej. González"
                  value={form.lastName}
                  onChange={e => updateField('lastName', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Email *</label>
              <div style={{ position: 'relative' }}>
                <Mail
                  size={14}
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
                />
                <input
                  className="new-lead-input"
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={form.email}
                  onChange={e => updateField('email', e.target.value)}
                  style={errors.email ? inputWithIconErrorStyle : inputWithIconStyle}
                />
              </div>
              {errors.email && <p style={errorStyle}>{errors.email}</p>}
            </div>

            {/* Teléfono */}
            <div style={{ marginBottom: '12px' }}>
              <label style={labelStyle}>Teléfono</label>
              <div style={{ position: 'relative' }}>
                <Phone
                  size={14}
                  style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}
                />
                <input
                  className="new-lead-input"
                  type="tel"
                  placeholder="(757) 555-0000"
                  value={form.phone}
                  onChange={e => updateField('phone', e.target.value)}
                  style={inputWithIconStyle}
                />
              </div>
            </div>

            {/* Idioma */}
            <div>
              <label style={labelStyle}>Idioma preferido</label>
              <div style={{ position: 'relative' }}>
                <select
                  className="new-lead-input"
                  value={form.language}
                  onChange={e => {
                    const val = e.target.value
                    if (val === '') {
                      updateField('language', '')
                    } else {
                      handleLanguageChange(val as Language)
                    }
                  }}
                  style={{ ...inputStyle, appearance: 'none', cursor: 'pointer', paddingRight: '32px' }}
                >
                  <option value="">-- Seleccionar --</option>
                  <option value="es">🇪🇸 Español</option>
                  <option value="en">🇺🇸 English</option>
                  <option value="pt">🇧🇷 Português</option>
                </select>
                <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', fontSize: '10px' }}>▼</span>
              </div>
            </div>

            {/* Lender field — full width */}
            <div style={{ gridColumn: '1 / -1', marginTop: '12px' }}>
              <label style={labelStyle}>
                Prestamista
                <span style={{ color: 'var(--text-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: '6px' }}>
                  (opcional)
                </span>
              </label>
              <div style={{ position: 'relative' }}>
                <Building2
                  size={15}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)',
                    pointerEvents: 'none',
                  }}
                />
                <input
                  className="new-lead-input"
                  type="text"
                  value={form.lender}
                  onChange={(e) => updateField('lender', e.target.value)}
                  placeholder="Ej. Navy Federal, Wells Fargo, prestamista privado..."
                  style={{ ...inputStyle, paddingLeft: '34px' }}
                />
              </div>
            </div>
          </div>

          {/* SECCIÓN 2 — Asignación */}
          <div style={sectionHeaderStyle}>Asignación</div>
          <div style={{ ...sectionBodyStyle }}>
            <label style={labelStyle}>Agente asignado *</label>

            {autoAssigned && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--accent-gold)' }}>✓ Autoasignado por idioma</span>
                <button
                  onClick={() => { updateField('agentId', ''); setAutoAssigned(false) }}
                  style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Cambiar
                </button>
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <select
                className="new-lead-input"
                value={form.agentId}
                onChange={e => handleAgentChange(e.target.value)}
                style={{
                  ...(errors.agentId ? inputErrorStyle : inputStyle),
                  appearance: 'none',
                  cursor: 'pointer',
                  paddingRight: '32px',
                }}
              >
                <option value="">-- Seleccionar agente --</option>
                {MOCK_AGENTS.map(agent => (
                  <option key={agent.id} value={agent.id}>
                    {agent.avatarInitials} · {agent.name} · {SPECIALTY_LABEL[agent.specialty]} · {LANG_FLAG[agent.language]}{LANG_LABEL[agent.language]}
                  </option>
                ))}
              </select>
              <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', fontSize: '10px' }}>▼</span>
            </div>
            {errors.agentId && <p style={errorStyle}>{errors.agentId}</p>}

            {/* Agent preview */}
            {selectedAgent && (
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '10px 12px',
                marginTop: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: `${selectedAgent.accentColor}22`,
                  border: `1px solid ${selectedAgent.accentColor}44`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: selectedAgent.accentColor,
                  flexShrink: 0,
                }}>
                  {selectedAgent.avatarInitials}
                </div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{selectedAgent.name}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {SPECIALTY_LABEL[selectedAgent.specialty]} · {LANG_FLAG[selectedAgent.language]} {selectedAgent.language.toUpperCase()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECCIÓN 3 — Origen */}
          <div style={sectionHeaderStyle}>Origen</div>
          <div style={{ ...sectionBodyStyle }}>
            <label style={labelStyle}>¿Cómo llegó este lead? *</label>
            <div style={{ position: 'relative' }}>
              <select
                className="new-lead-input"
                value={form.sourceType}
                onChange={e => updateField('sourceType', e.target.value)}
                style={{
                  ...(errors.sourceType ? inputErrorStyle : inputStyle),
                  appearance: 'none',
                  cursor: 'pointer',
                  paddingRight: '32px',
                }}
              >
                <option value="">-- Seleccionar origen --</option>
                <option value="manual">✍️ Registro manual</option>
                <option value="open_house">🏠 Open House</option>
                <option value="referral">🤝 Referido</option>
                <option value="web_form">🌐 Formulario web</option>
                <option value="lead_magnet">📄 Lead Magnet</option>
                <option value="ads">📣 Meta Ads</option>
              </select>
              <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', fontSize: '10px' }}>▼</span>
            </div>
            {errors.sourceType && <p style={errorStyle}>{errors.sourceType}</p>}

            {/* Referral name — conditional */}
            {form.sourceType === 'referral' && (
              <div style={{ marginTop: '12px', opacity: 1, transition: 'opacity 0.2s' }}>
                <label style={labelStyle}>Nombre del referido</label>
                <input
                  className="new-lead-input"
                  type="text"
                  placeholder="¿Quién lo refirió?"
                  value={form.referralName}
                  onChange={e => updateField('referralName', e.target.value)}
                  style={inputStyle}
                />
              </div>
            )}
          </div>

          {/* SECCIÓN 4 — Notas */}
          <div style={{ ...sectionHeaderStyle, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>Notas internas</span>
            <span style={{
              fontSize: '10px',
              padding: '2px 7px',
              borderRadius: '10px',
              background: 'var(--bg-overlay)',
              color: 'var(--text-muted)',
              fontWeight: 400,
              textTransform: 'none',
              letterSpacing: 0,
            }}>Opcional</span>
          </div>
          <div style={{ padding: '20px' }}>
            <textarea
              className="new-lead-input"
              rows={4}
              maxLength={500}
              placeholder="Añade contexto sobre este lead..."
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              style={{ ...inputStyle, resize: 'none', fontFamily: 'inherit' }}
            />
            <div style={{ textAlign: 'right', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              {form.notes.length}/500
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <button
            className="cancel-btn"
            onClick={() => router.back()}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '13px',
              cursor: 'pointer',
              padding: '8px 0',
            }}
          >
            Cancelar
          </button>
          <button
            className="submit-btn"
            onClick={handleSubmit}
            disabled={isSubmitDisabled}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 24px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--accent-gold)',
              color: 'var(--bg-base)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: isSubmitDisabled ? 'not-allowed' : 'pointer',
              opacity: isSubmitDisabled ? 0.5 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <CheckCircle2 size={15} />
            Registrar lead
          </button>
        </div>
          </>
        )}

        {mode === 'import' && (
          <div style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '16px',
            overflow: 'hidden',
            padding: '24px',
          }}>

            {/* PASO 1: Download template */}
            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
              Paso 1 — Descarga la plantilla
            </p>
            <button
              onClick={downloadTemplate}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                color: 'var(--accent-gold)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <Download size={14} />
              Descargar plantilla CSV
            </button>
            <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Columnas: firstName · lastName · email · phone · language · agentId · sourceType · lender · notes
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />

            {/* PASO 2: Upload zone */}
            <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
              Paso 2 — Sube tu archivo completado
            </p>

            {importStatus !== 'preview' && importStatus !== 'success' && (
              <>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setIsDragging(false)
                    const file = e.dataTransfer.files[0]
                    if (file) handleFileUpload(file)
                  }}
                  style={{
                    border: `2px dashed ${isDragging ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                    borderRadius: '12px',
                    padding: '48px 24px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: isDragging ? 'rgba(201,169,110,0.04)' : 'var(--bg-elevated)',
                    transition: 'all 0.2s',
                  }}
                >
                  <FileUp size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
                  <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                    Arrastra tu archivo aquí, o{' '}
                    <span style={{ color: 'var(--accent-gold)' }}>haz click para seleccionar</span>
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Formatos aceptados: .csv · .xlsx — Máximo 500 filas
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.xlsx"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleFileUpload(file)
                    }}
                  />
                </div>

                {/* Error display */}
                {importStatus === 'error' && (
                  <div style={{
                    marginTop: '16px',
                    padding: '12px 16px',
                    background: 'rgba(201,123,107,0.1)',
                    border: '1px solid rgba(201,123,107,0.3)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                  }}>
                    <AlertTriangle size={16} style={{ color: 'var(--accent-coral)', flexShrink: 0, marginTop: '1px' }} />
                    <div>
                      <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--accent-coral)', marginBottom: '4px' }}>
                        Error al procesar el archivo
                      </p>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{importError}</p>
                    </div>
                  </div>
                )}

                {importStatus === 'parsing' && (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '16px' }}>
                    Procesando archivo...
                  </p>
                )}
              </>
            )}

          </div>
        )}
      </div>
    </>
  )
}
