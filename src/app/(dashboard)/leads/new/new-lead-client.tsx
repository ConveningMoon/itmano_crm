'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import type { Agent, Language } from '@/lib/types'
import type { ChannelOption, TenantOption } from './page'
import { createLead, createLeadsBulk, getExistingLeadEmails } from './actions'
import { parseLeadRows, type ParseLeadsResult, type NormalizedLead } from '@/lib/import/parse-leads'
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
  Camera,
  ThumbsUp,
  MessageCircle,
  FileDown,
  Calendar,
  Globe,
} from 'lucide-react'

interface FormData {
  firstName:            string
  lastName:             string
  email:                string
  phone:                string
  language:             Language | ''
  agentId:              string
  channelType:          string
  acquisitionChannelId: string
  lender:               string
  notes:                string
}

interface FormErrors {
  firstName?:            string
  email?:                string
  agentId?:             string
  acquisitionChannelId?: string
  tenantId?:             string
}

type ImportStatus = 'idle' | 'parsing' | 'preview' | 'success' | 'error'

type FileFormat = 'csv' | 'xlsx'

const INITIAL_FORM: FormData = {
  firstName:            '',
  lastName:             '',
  email:                '',
  phone:                '',
  language:             '',
  agentId:              '',
  channelType:          '',
  acquisitionChannelId: '',
  lender:               '',
  notes:                '',
}

// Lead-registration sources. The first four are DIRECT-ENTRY: the source IS the
// origin (no specific acquisition channel), so traffic_source is set from the
// source and the "origen" picker is hidden. The last three are channel-based:
// they require picking a specific acquisition channel (current behavior).
const SOURCE_OPTIONS: { value: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { value: 'manual',       label: 'Registro manual', icon: PenLine },
  // lucide-react v1 dropped brand icons (Instagram/Facebook); use representative
  // generics: camera (IG photos), thumbs-up (FB), message circle (WhatsApp DM).
  { value: 'instagram',    label: 'Instagram',       icon: Camera },
  { value: 'facebook',     label: 'Facebook',        icon: ThumbsUp },
  { value: 'whatsapp',     label: 'WhatsApp',        icon: MessageCircle },
  { value: 'lead_magnet',  label: 'Lead Magnet',     icon: FileDown },
  { value: 'event',        label: 'Evento',          icon: Calendar },
  { value: 'contact_form', label: 'Formulario Web',  icon: Globe },
]

const CHANNEL_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_OPTIONS.map(o => [o.value, o.label])
)

// Direct-entry sources → their traffic_source value. The lead's channel_type is
// forced to 'manual' and acquisition_channel_id to null for these.
const DIRECT_ENTRY_SOURCES = new Set(['manual', 'instagram', 'facebook', 'whatsapp'])
const TRAFFIC_SOURCE_BY_SOURCE: Record<string, string> = {
  manual:    'direct',
  instagram: 'instagram',
  facebook:  'facebook',
  whatsapp:  'whatsapp',
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
  agents: Agent[]
  onReset: () => void
}

function SuccessScreen({ form, agents, onReset }: SuccessScreenProps) {
  const router = useRouter()
  const agentName = agents.find(a => a.id === form.agentId)?.name || 'el agente'
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
        Lead registrado correctamente
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

export function NewLeadClient({
  agents,
  channels,
  isSuperAdmin = false,
  tenants = [],
  myAgentId = null,
}: {
  agents: Agent[]
  channels: ChannelOption[]
  isSuperAdmin?: boolean
  tenants?: TenantOption[]
  myAgentId?: string | null
}) {
  const router = useRouter()

  const [form, setForm] = useState<FormData>(INITIAL_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [autoAssigned, setAutoAssigned] = useState(false)
  const [mode, setMode] = useState<'manual' | 'import'>('manual')
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
  const [parseResult, setParseResult] = useState<ParseLeadsResult | null>(null)
  const [existingEmails, setExistingEmails] = useState<Set<string>>(new Set())
  const [importAgentId, setImportAgentId] = useState('')   // attribution agent (when no linked agent)
  const [confirming, setConfirming] = useState(false)       // double-confirmation gate
  const [importedCount, setImportedCount] = useState(0)
  const [fileFormat, setFileFormat] = useState<FileFormat>('csv')
  const [importError, setImportError] = useState<string>('')
  const [isDragging, setIsDragging] = useState(false)
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // For super_admin, agents/channels are filtered to the chosen tenant (none until
  // one is picked). owner/agent always see their own tenant's data.
  const visibleAgents   = isSuperAdmin ? (selectedTenantId ? agents.filter(a => a.tenantId === selectedTenantId) : []) : agents
  const visibleChannels = isSuperAdmin ? (selectedTenantId ? channels.filter(c => c.tenantId === selectedTenantId) : []) : channels

  function handleTenantChange(tenantId: string) {
    setSelectedTenantId(tenantId)
    // Agent + channel belong to the previous tenant — clear them.
    setForm(prev => ({ ...prev, agentId: '', acquisitionChannelId: '', channelType: '' }))
    setErrors(prev => ({ ...prev, tenantId: undefined, agentId: undefined, acquisitionChannelId: undefined }))
  }

  const AGENT_DISPLAY_NAMES: Record<string, string> = Object.fromEntries(
    agents.map(a => [a.id, a.name])
  )

  // Headers use Spanish labels the tolerant matcher recognizes; status is Nuevo/Cerrado.
  const TEMPLATE_HEADERS = ['nombre', 'apellido', 'email', 'telefono', 'idioma', 'estatus', 'prestamista', 'notas']

  function leadToRow(l: NormalizedLead): string[] {
    return [
      l.firstName, l.lastName, l.email, l.phone, l.language,
      l.status === 'new' ? 'Nuevo' : 'Cerrado', l.lender, l.notes,
    ]
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  function downloadTemplate() {
    const example = ['María', 'González', 'maria@email.com', '(757) 555-0100', 'es', 'Nuevo', 'Navy Federal', 'Cliente interesada en Virginia Beach']
    const notes = [
      '# INSTRUCCIONES:',
      '# idioma: es | en | pt (vacío → es)',
      '# estatus: Nuevo | Cerrado (vacío o inválido → Cerrado)',
      '# email es obligatorio; filas sin email se omiten',
      '# Elimina estas líneas de comentario antes de importar',
      '',
    ]
    const csv = [...notes, TEMPLATE_HEADERS.join(','), example.join(',')].join('\n')
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'plantilla_leads_itmano.csv')
  }

  // Exports the normalized, insert-ready dataset (already-existing rows excluded) in
  // the same format as the uploaded file.
  function downloadFinal(rows: NormalizedLead[]) {
    if (fileFormat === 'xlsx') {
      const aoa = [TEMPLATE_HEADERS, ...rows.map(leadToRow)]
      const ws  = XLSX.utils.aoa_to_sheet(aoa)
      const wb  = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Leads')
      const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
      triggerDownload(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'leads_a_importar.xlsx')
    } else {
      const esc = (v: string) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
      const csv = [TEMPLATE_HEADERS.join(','), ...rows.map(r => leadToRow(r).map(esc).join(','))].join('\n')
      triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), 'leads_a_importar.csv')
    }
  }

  function resetImport() {
    setImportStatus('idle'); setParseResult(null); setExistingEmails(new Set())
    setConfirming(false); setImportError('')
  }

  async function handleFileUpload(file: File) {
    setImportStatus('parsing')
    setImportError(''); setConfirming(false)

    if (isSuperAdmin && !selectedTenantId) {
      setImportError('Selecciona un tenant antes de subir el archivo')
      setImportStatus('error'); return
    }

    const extension = file.name.split('.').pop()?.toLowerCase()

    try {
      let rawRows: Record<string, string>[] = []
      let headers: string[] = []

      if (extension === 'csv') {
        setFileFormat('csv')
        await new Promise<void>((resolve, reject) => {
          Papa.parse<Record<string, string>>(file, {
            header: true, skipEmptyLines: true, comments: '#',
            complete: (results) => {
              rawRows = results.data
              headers = results.meta.fields ?? []
              resolve()
            },
            error: (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))),
          })
        })
      } else if (extension === 'xlsx') {
        setFileFormat('xlsx')
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: '' })
        headers = [...new Set(rawRows.flatMap(r => Object.keys(r)))]
      } else {
        throw new Error('Formato no soportado. Usa .csv o .xlsx')
      }

      if (rawRows.length === 0) throw new Error('El archivo está vacío o no tiene filas de datos')
      if (rawRows.length > 500) throw new Error(`El archivo tiene ${rawRows.length} filas. El máximo permitido es 500`)

      const result = parseLeadRows(rawRows, headers)

      // Flag rows whose email already exists in the tenant.
      const emails = result.rows.map(r => r.email)
      const existing = await getExistingLeadEmails(emails, isSuperAdmin ? selectedTenantId : undefined)
      setExistingEmails(existing.ok ? new Set(existing.existing.map(e => e.toLowerCase())) : new Set())

      setParseResult(result)
      setImportStatus('preview')
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Error al procesar el archivo')
      setImportStatus('error')
    }
  }

  async function handleImport(rowsToInsert: NormalizedLead[], agentId: string) {
    if (rowsToInsert.length === 0 || !agentId) return
    setImportStatus('parsing')
    const result = await createLeadsBulk(
      rowsToInsert.map(r => ({
        firstName: r.firstName,
        lastName:  r.lastName,
        email:     r.email,
        phone:     r.phone || null,
        language:  r.language as Language,
        status:    r.status,
        lender:    r.lender || null,
        notes:     r.notes || null,
      })),
      agentId,
      isSuperAdmin ? selectedTenantId : undefined,
    )
    if (!result.ok) {
      setImportStatus('error'); setImportError(result.error)
    } else {
      setImportedCount(result.result.inserted)
      setImportStatus('success')
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
    // Language→agent auto-routing is A&J (tenant-aj) specific; skip it for
    // super_admin (who may be creating in any tenant and picks the agent).
    if (!isSuperAdmin && !form.agentId) {
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
    if (isSuperAdmin && !selectedTenantId) newErrors.tenantId = 'Selecciona un tenant'
    if (!form.firstName.trim()) newErrors.firstName = 'El nombre es obligatorio'
    if (!form.email.trim()) {
      newErrors.email = 'El email es obligatorio'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      newErrors.email = 'Email no válido'
    }
    if (!form.agentId) newErrors.agentId = 'Selecciona un agente'
    if (!form.channelType) {
      newErrors.acquisitionChannelId = 'Selecciona la fuente'
    } else if (!DIRECT_ENTRY_SOURCES.has(form.channelType) && !form.acquisitionChannelId) {
      // Origin is only required for channel-based sources (LM / event / contact form).
      newErrors.acquisitionChannelId = 'Selecciona el origen'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  async function handleManualSubmit() {
    if (!validate()) return
    setIsSubmitting(true)
    // Direct-entry sources: traffic_source = the source, channel forced to manual /
    // null. Channel-based sources keep traffic_source 'direct' and their channel.
    const directEntry  = DIRECT_ENTRY_SOURCES.has(form.channelType)
    const trafficSource = TRAFFIC_SOURCE_BY_SOURCE[form.channelType] ?? 'direct'
    const result = await createLead({
      firstName:            form.firstName,
      lastName:             form.lastName,
      email:                form.email,
      phone:                form.phone || null,
      language:             form.language as Language,
      agentId:              form.agentId,
      acquisitionChannelId: directEntry ? '' : form.acquisitionChannelId,
      channelType:          directEntry ? 'manual' : form.channelType,
      trafficSource,
      lender:               form.lender || null,
      notes:                form.notes || null,
      tenantId:             isSuperAdmin ? selectedTenantId : undefined,
    })
    setIsSubmitting(false)
    if (result.error) {
      setErrors({ firstName: result.error })
    } else {
      setSubmitSuccess(true)
    }
  }

  const handleReset = () => {
    setForm(INITIAL_FORM)
    setErrors({})
    setAutoAssigned(false)
    setSubmitSuccess(false)
    resetImport()
  }

  const selectedAgent = agents.find(a => a.id === form.agentId)
  const isSubmitDisabled = !form.firstName.trim() || !form.email.trim() || isSubmitting

  // Channels filtered by type for cascade picker (scoped to the visible tenant)
  const channelsForType = (type: string) => visibleChannels.filter(c => c.channelType === type)

  // When source changes: direct-entry → no channel; channel-based → auto-select if
  // only one option, else clear for explicit pick.
  function handleChannelTypeChange(type: string) {
    if (DIRECT_ENTRY_SOURCES.has(type)) {
      updateField('channelType', type)
      updateField('acquisitionChannelId', '')
    } else {
      const options = channelsForType(type)
      const autoId  = options.length === 1 ? options[0].id : ''
      updateField('channelType', type)
      updateField('acquisitionChannelId', autoId)
    }
    if (errors.acquisitionChannelId) setErrors(prev => ({ ...prev, acquisitionChannelId: undefined }))
  }

  // ─── Import preview computeds ─────────────────────────────────────────────
  const importRows  = parseResult?.rows ?? []
  const finalRows   = importRows.filter(r => !existingEmails.has(r.email.toLowerCase()))
  const existingCount = importRows.length - finalRows.length
  const newCount    = finalRows.filter(r => r.status === 'new').length
  const closedCount = finalRows.filter(r => r.status === 'closed').length
  // Attribution: the linked agent if any, else the (mandatory) selector value.
  const attributionAgentId   = myAgentId ?? importAgentId
  const attributionAgentName = AGENT_DISPLAY_NAMES[attributionAgentId] || '—'
  const needsAgentSelector   = !myAgentId

  if (submitSuccess) return <SuccessScreen form={form} agents={agents} onReset={handleReset} />

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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" style={{ marginBottom: '12px' }}>
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

          {/* SECCIÓN 0 — Tenant (super_admin only) */}
          {isSuperAdmin && (
            <>
              <div style={sectionHeaderStyle}>Tenant</div>
              <div style={{ ...sectionBodyStyle }}>
                <label style={labelStyle}>Tenant destino *</label>
                <div style={{ position: 'relative' }}>
                  <select
                    className="new-lead-input"
                    value={selectedTenantId}
                    onChange={e => handleTenantChange(e.target.value)}
                    style={{
                      ...(errors.tenantId ? inputErrorStyle : inputStyle),
                      appearance: 'none',
                      cursor: 'pointer',
                      paddingRight: '32px',
                    }}
                  >
                    <option value="">-- Seleccionar tenant --</option>
                    {tenants.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', fontSize: '10px' }}>▼</span>
                </div>
                {errors.tenantId && <p style={errorStyle}>{errors.tenantId}</p>}
              </div>
            </>
          )}

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
                <option value="">{isSuperAdmin && !selectedTenantId ? '-- Selecciona un tenant primero --' : '-- Seleccionar agente --'}</option>
                {visibleAgents.map(agent => (
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
            {/* Step 1: Source picker (icon chips) */}
            <label style={labelStyle}>¿Cómo llegó este lead? *</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
              {SOURCE_OPTIONS.map(opt => {
                const Icon   = opt.icon
                const active = form.channelType === opt.value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleChannelTypeChange(opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '7px',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      border: `1px solid ${active ? 'var(--accent-gold)' : 'var(--border-subtle)'}`,
                      background: active ? 'rgba(201,169,110,0.10)' : 'var(--bg-elevated)',
                      color: active ? 'var(--accent-gold)' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <Icon size={14} strokeWidth={1.7} />
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {/* Step 2: Specific channel — only for channel-based sources with >1 option */}
            {!DIRECT_ENTRY_SOURCES.has(form.channelType) && form.channelType && channelsForType(form.channelType).length > 1 && (
              <div style={{ position: 'relative' }}>
                <select
                  className="new-lead-input"
                  value={form.acquisitionChannelId}
                  onChange={e => updateField('acquisitionChannelId', e.target.value)}
                  style={{
                    ...(errors.acquisitionChannelId ? inputErrorStyle : inputStyle),
                    appearance: 'none',
                    cursor: 'pointer',
                    paddingRight: '32px',
                  }}
                >
                  <option value="">-- Seleccionar {CHANNEL_TYPE_LABELS[form.channelType]} --</option>
                  {channelsForType(form.channelType).map(ch => (
                    <option key={ch.id} value={ch.id}>{ch.name}</option>
                  ))}
                </select>
                <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', fontSize: '10px' }}>▼</span>
              </div>
            )}

            {/* Auto-resolved channel name display */}
            {form.acquisitionChannelId && channelsForType(form.channelType).length === 1 && (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Canal: <span style={{ color: 'var(--accent-gold)' }}>
                  {channels.find(c => c.id === form.acquisitionChannelId)?.name}
                </span>
              </div>
            )}

            {errors.acquisitionChannelId && <p style={errorStyle}>{errors.acquisitionChannelId}</p>}
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
            onClick={handleManualSubmit}
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
            {isSubmitting ? 'Registrando...' : 'Registrar lead'}
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
              Columnas (reconocimiento automático, es/en): nombre · apellido · email · teléfono · idioma · estatus (Nuevo/Cerrado) · prestamista · notas
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

            {/* PASO 3: Preview + double confirmation */}
            {importStatus === 'preview' && parseResult && (
              <>
                <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>
                    Paso 3 — Revisa y confirma
                  </p>
                  <button onClick={resetImport} style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    ✕ Cancelar
                  </button>
                </div>

                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '10px' }}>
                  {finalRows.length} se importarán ({newCount} Nuevos · {closedCount} Cerrados) · {parseResult.totalRows} filas en el archivo
                </div>

                {/* Warnings */}
                {(() => {
                  const warns: string[] = []
                  if (parseResult.excludedNoEmail > 0)         warns.push(`${parseResult.excludedNoEmail} fila(s) sin email válido — omitidas`)
                  if (parseResult.excludedDuplicateInFile > 0) warns.push(`${parseResult.excludedDuplicateInFile} email(s) duplicado(s) en el archivo — se conserva la primera`)
                  if (existingCount > 0)                       warns.push(`${existingCount} ya existen en este tenant — omitidas`)
                  if (parseResult.statusDefaulted > 0)         warns.push(`${parseResult.statusDefaulted} fila(s) sin estatus válido — asignadas a "Cerrado"`)
                  if (parseResult.ignoredColumns.length > 0)   warns.push(`Columnas ignoradas: ${parseResult.ignoredColumns.join(', ')}`)
                  if (warns.length === 0) return null
                  return (
                    <div style={{ background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.25)', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px' }}>
                      {warns.map((w, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '12px', color: 'var(--text-secondary)', marginTop: i === 0 ? 0 : '6px' }}>
                          <AlertTriangle size={13} style={{ color: 'var(--accent-gold)', flexShrink: 0, marginTop: '1px' }} />
                          <span>{w}</span>
                        </div>
                      ))}
                    </div>
                  )
                })()}

                {/* Attribution agent */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={labelStyle}>Agente al que se atribuirán los leads *</label>
                  {needsAgentSelector ? (
                    <div style={{ position: 'relative' }}>
                      <select
                        className="new-lead-input"
                        value={importAgentId}
                        onChange={e => setImportAgentId(e.target.value)}
                        style={{ ...inputStyle, appearance: 'none', cursor: 'pointer', paddingRight: '32px' }}
                      >
                        <option value="">-- Seleccionar agente --</option>
                        {visibleAgents.map(a => (
                          <option key={a.id} value={a.id}>{a.avatarInitials} · {a.name}</option>
                        ))}
                      </select>
                      <span style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', fontSize: '10px' }}>▼</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: '13px', color: 'var(--text-primary)', padding: '4px 0' }}>{attributionAgentName}</div>
                  )}
                </div>

                {/* Preview table (insert-ready rows) — dense table, out of redesign
                    scope; horizontally scrollable on phones (overflow-x). */}
                {finalRows.length > 0 && (
                  <div className="overflow-x-auto" style={{ overflowY: 'auto', maxHeight: '300px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: 'var(--bg-elevated)' }}>
                          {['#', 'Nombre', 'Email', 'Teléfono', 'Idioma', 'Prestamista', 'Estatus'].map(col => (
                            <th key={col} style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--bg-elevated)', padding: '8px 10px', textAlign: 'left', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--border-subtle)', whiteSpace: 'nowrap' }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {finalRows.slice(0, 50).map((r, i) => (
                          <tr key={`${r.email}-${i}`}>
                            <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-primary)' }}>{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{r.email}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{r.phone || '—'}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{r.language.toUpperCase()}</td>
                            <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{r.lender || '—'}</td>
                            <td style={{ padding: '8px 10px' }}>
                              <span style={{ fontSize: '11px', color: r.status === 'new' ? 'var(--accent-gold)' : 'var(--text-muted)' }}>
                                {r.status === 'new' ? 'Nuevo' : 'Cerrado'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {finalRows.length > 50 && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>Mostrando 50 de {finalRows.length}.</div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', gap: '12px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => downloadFinal(finalRows)}
                    disabled={finalRows.length === 0}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '9px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '12px', fontWeight: 500, cursor: finalRows.length === 0 ? 'not-allowed' : 'pointer', opacity: finalRows.length === 0 ? 0.5 : 1 }}
                  >
                    <Download size={14} />
                    Descargar archivo final ({fileFormat.toUpperCase()})
                  </button>

                  {!confirming ? (
                    <button
                      onClick={() => setConfirming(true)}
                      disabled={finalRows.length === 0 || !attributionAgentId}
                      style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: (finalRows.length === 0 || !attributionAgentId) ? 'not-allowed' : 'pointer', opacity: (finalRows.length === 0 || !attributionAgentId) ? 0.5 : 1 }}
                    >
                      Continuar
                    </button>
                  ) : null}
                </div>

                {/* Double confirmation */}
                {confirming && (
                  <div style={{ marginTop: '16px', background: 'var(--bg-elevated)', border: '1px solid var(--accent-gold)', borderRadius: '10px', padding: '16px' }}>
                    <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 0 12px' }}>
                      Se registrarán <strong>{finalRows.length}</strong> leads ({newCount} Nuevos, {closedCount} Cerrados) asignados a <strong>{attributionAgentName}</strong>. Esta acción no se puede deshacer.
                    </p>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleImport(finalRows, attributionAgentId)}
                        style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: 'var(--accent-gold)', color: 'var(--bg-base)', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        <CheckCircle2 size={14} />
                        Confirmar e importar {finalRows.length}
                      </button>
                      <button onClick={() => setConfirming(false)} style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '13px', cursor: 'pointer' }}>
                        Volver
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Import success screen */}
            {importStatus === 'success' && (
              <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                <CheckCircle2 size={48} style={{ color: 'var(--accent-green)', marginBottom: '16px' }} />
                <h3 style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
                  Importación completada
                </h3>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
                  {importedCount} lead(s) añadidos al sistema.
                </p>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button
                    onClick={() => router.push('/leads')}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
                  >
                    ← Ver todos los leads
                  </button>
                  <button
                    onClick={resetImport}
                    style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: 'var(--accent-gold)', color: 'var(--bg-base)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                  >
                    + Importar otro archivo
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </>
  )
}
