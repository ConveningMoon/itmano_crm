'use client'

import { useId, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Agent, Language } from '@/lib/types'
import type { ChannelOption, TenantOption } from './page'
import { createLead, createLeadsBulk, getExistingLeadEmails } from './actions'
import { parseLeadRows, type ParseLeadsResult, type NormalizedLead } from '@/lib/import/parse-leads'
import { LANGUAGE_CONFIG, SUPPORTED_LANGUAGE_CODES } from '@/lib/config'
import { Tabs } from '@/components/ui/tabs'
import {
  CheckCircle2,
  ChevronDown,
  Mail,
  Phone,
  Building2,
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
  X,
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

const LANG_FLAG: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGE_CODES.map(c => [c, LANGUAGE_CONFIG[c].flag])
)
const LANG_LABEL: Record<string, string> = Object.fromEntries(
  SUPPORTED_LANGUAGE_CODES.map(c => [c, c.toUpperCase()])
)

// Clases del input según haya error: el borde coral es la única marca del fallo
// además del texto debajo.
const inputClass = (invalid?: string) => invalid ? 'settings-input settings-input-invalid' : 'settings-input'

// Select con el chevron de los controles del CRM.
function SelectField({ id, invalid, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: string }) {
  return (
    <span className="select-field select-field-full">
      <select id={id} className={inputClass(invalid)} aria-invalid={invalid ? true : undefined} {...props}>
        {children}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </span>
  )
}

function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="form-error">{message}</p> : null
}

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
    <div className="settings-card done-card form-narrow" role="status">
      <span className="empty-card-icon" aria-hidden="true"><CheckCircle2 size={24} strokeWidth={1.5} /></span>
      <h2 className="done-card-title">Lead registrado correctamente</h2>
      <p className="done-card-text">{fullName} ha sido añadido al sistema y asignado a {agentName}.</p>
      <p className="settings-note">La secuencia de email se activará automáticamente.</p>
      {form.lender && (
        <p className="settings-note">Prestamista: <strong>{form.lender}</strong></p>
      )}
      <div className="settings-actions">
        <button type="button" onClick={() => router.push('/leads')} className="btn btn-ghost">
          ← Ver todos los leads
        </button>
        <button type="button" onClick={onReset} className="btn btn-primary">
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
  lockedAgentId = null,
}: {
  agents: Agent[]
  channels: ChannelOption[]
  isSuperAdmin?: boolean
  tenants?: TenantOption[]
  myAgentId?: string | null
  // Rol 'agent': el servidor le atribuye siempre sus leads, así que el
  // formulario no le ofrece elegir agente.
  lockedAgentId?: string | null
}) {
  const router = useRouter()
  const fieldId = useId()

  const initialForm: FormData = { ...INITIAL_FORM, agentId: lockedAgentId ?? '' }
  const [form, setForm] = useState<FormData>(initialForm)
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitSuccess, setSubmitSuccess] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
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
      l.stage === 'nuevo' ? 'Nuevo' : 'Cerrado', l.lender, l.notes,
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
  async function downloadFinal(rows: NormalizedLead[]) {
    if (fileFormat === 'xlsx') {
      const XLSX = await import('xlsx')
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
        const { default: Papa } = await import('papaparse')
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
        const XLSX = await import('xlsx')
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
        stage:     r.stage,
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

  // El ruteo automático por idioma se retiró: el owner elige el agente.
  const handleLanguageChange = (lang: Language) => {
    updateField('language', lang)
  }

  const handleAgentChange = (agentId: string) => {
    updateField('agentId', agentId)
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
    setForm(initialForm)
    setErrors({})
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
  const newCount    = finalRows.filter(r => r.stage === 'nuevo').length
  const closedCount = finalRows.filter(r => r.stage === 'cerrado').length
  // Attribution: the linked agent if any, else the (mandatory) selector value.
  const attributionAgentId   = myAgentId ?? importAgentId
  const attributionAgentName = AGENT_DISPLAY_NAMES[attributionAgentId] || '—'
  const needsAgentSelector   = !myAgentId

  if (submitSuccess) return <SuccessScreen form={form} agents={agents} onReset={handleReset} />

  const id = (name: string) => `${fieldId}-${name}`

  const warnings: string[] = []
  if (parseResult) {
    if (parseResult.excludedNoEmail > 0)         warnings.push(`${parseResult.excludedNoEmail} fila(s) sin email válido — omitidas`)
    if (parseResult.excludedDuplicateInFile > 0) warnings.push(`${parseResult.excludedDuplicateInFile} email(s) duplicado(s) en el archivo — se conserva la primera`)
    if (existingCount > 0)                       warnings.push(`${existingCount} ya existen en este tenant — omitidas`)
    if (parseResult.stageDefaulted > 0)          warnings.push(`${parseResult.stageDefaulted} fila(s) sin etapa válida — asignadas a "Cerrado"`)
    if (parseResult.ignoredColumns.length > 0)   warnings.push(`Columnas ignoradas: ${parseResult.ignoredColumns.join(', ')}`)
  }

  return (
    <div className="form-narrow">
      {/* Modo: registro manual o importación — el estado vive aquí (padre),
          así que alternar tabs no pierde datos del formulario ni del import. */}
      <Tabs
        items={[
          { key: 'manual', label: 'Registro manual' },
          { key: 'import', label: 'Importar CSV/XLSX' },
        ]}
        value={mode}
        onChange={m => setMode(m as 'manual' | 'import')}
        content={{
          manual: (
        <form
          noValidate
          onSubmit={e => { e.preventDefault(); handleManualSubmit() }}
          className="settings-stack"
        >
          {/* Datos del lead */}
          <section className="settings-card">
            <div className="settings-card-head"><h2 className="settings-card-title">Datos del lead</h2></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={id('first')} className="settings-field-label">Nombre *</label>
                <input
                  id={id('first')}
                  type="text"
                  placeholder="Ej. María"
                  value={form.firstName}
                  onChange={e => updateField('firstName', e.target.value)}
                  aria-invalid={errors.firstName ? true : undefined}
                  className={inputClass(errors.firstName)}
                />
                <FieldError message={errors.firstName} />
              </div>
              <div>
                <label htmlFor={id('last')} className="settings-field-label">Apellido</label>
                <input
                  id={id('last')}
                  type="text"
                  placeholder="Ej. González"
                  value={form.lastName}
                  onChange={e => updateField('lastName', e.target.value)}
                  className="settings-input"
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor={id('email')} className="settings-field-label">Email *</label>
              <span className="input-icon">
                <Mail size={14} aria-hidden="true" />
                <input
                  id={id('email')}
                  type="email"
                  placeholder="correo@ejemplo.com"
                  value={form.email}
                  onChange={e => updateField('email', e.target.value)}
                  aria-invalid={errors.email ? true : undefined}
                  className={inputClass(errors.email)}
                />
              </span>
              <FieldError message={errors.email} />
            </div>

            <div className="form-field">
              <label htmlFor={id('phone')} className="settings-field-label">Teléfono</label>
              <span className="input-icon">
                <Phone size={14} aria-hidden="true" />
                <input
                  id={id('phone')}
                  type="tel"
                  placeholder="(757) 555-0000"
                  value={form.phone}
                  onChange={e => updateField('phone', e.target.value)}
                  className="settings-input"
                />
              </span>
            </div>

            <div className="form-field">
              <label htmlFor={id('lang')} className="settings-field-label">Idioma preferido</label>
              <SelectField
                id={id('lang')}
                value={form.language}
                onChange={e => {
                  const val = e.target.value
                  if (val === '') updateField('language', '')
                  else handleLanguageChange(val as Language)
                }}
              >
                <option value="">-- Seleccionar --</option>
                <option value="es">🇪🇸 Español</option>
                <option value="en">🇺🇸 English</option>
                <option value="pt">🇧🇷 Português</option>
              </SelectField>
            </div>

            <div className="form-field">
              <label htmlFor={id('lender')} className="settings-field-label">
                Prestamista<span className="form-hint">(opcional)</span>
              </label>
              <span className="input-icon">
                <Building2 size={15} aria-hidden="true" />
                <input
                  id={id('lender')}
                  type="text"
                  value={form.lender}
                  onChange={e => updateField('lender', e.target.value)}
                  placeholder="Ej. Navy Federal, Wells Fargo, prestamista privado..."
                  className="settings-input"
                />
              </span>
            </div>
          </section>

          {/* Tenant (super_admin only) */}
          {isSuperAdmin && (
            <section className="settings-card">
              <div className="settings-card-head"><h2 className="settings-card-title">Tenant</h2></div>
              <label htmlFor={id('tenant')} className="settings-field-label">Tenant destino *</label>
              <SelectField
                id={id('tenant')}
                value={selectedTenantId}
                onChange={e => handleTenantChange(e.target.value)}
                invalid={errors.tenantId}
              >
                <option value="">-- Seleccionar tenant --</option>
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </SelectField>
              <FieldError message={errors.tenantId} />
            </section>
          )}

          {/* Asignación */}
          <section className="settings-card">
            <div className="settings-card-head"><h2 className="settings-card-title">Asignación</h2></div>
            {lockedAgentId ? (
              <p className="settings-note">Los leads que registras se te asignan automáticamente.</p>
            ) : (
              <>
                <label htmlFor={id('agent')} className="settings-field-label">Agente asignado *</label>
                <SelectField
                  id={id('agent')}
                  value={form.agentId}
                  onChange={e => handleAgentChange(e.target.value)}
                  invalid={errors.agentId}
                >
                  <option value="">{isSuperAdmin && !selectedTenantId ? '-- Selecciona un tenant primero --' : '-- Seleccionar agente --'}</option>
                  {visibleAgents.map(agent => (
                    <option key={agent.id} value={agent.id}>
                      {agent.avatarInitials} · {agent.name} · {LANG_FLAG[agent.language]}{LANG_LABEL[agent.language]}
                    </option>
                  ))}
                </SelectField>
                <FieldError message={errors.agentId} />
              </>
            )}

            {selectedAgent && (
              <div className="agent-preview">
                <span className="avatar" style={{ '--tone': selectedAgent.accentColor } as React.CSSProperties} aria-hidden="true">
                  {selectedAgent.avatarInitials}
                </span>
                <div>
                  <div className="agent-preview-name">{selectedAgent.name}</div>
                  <div className="settings-note">{LANG_FLAG[selectedAgent.language]} {selectedAgent.language.toUpperCase()}</div>
                </div>
              </div>
            )}
          </section>

          {/* Origen */}
          <section className="settings-card">
            <div className="settings-card-head"><h2 className="settings-card-title">Origen</h2></div>
            <span className="settings-field-label" id={id('source')}>¿Cómo llegó este lead? *</span>
            <div className="choice-chips" role="group" aria-labelledby={id('source')}>
              {SOURCE_OPTIONS.map(opt => {
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleChannelTypeChange(opt.value)}
                    aria-pressed={form.channelType === opt.value}
                    className="choice-chip"
                  >
                    <Icon size={14} strokeWidth={1.7} />
                    {opt.label}
                  </button>
                )
              })}
            </div>

            {/* Canal concreto — sólo para fuentes con canal y más de una opción */}
            {!DIRECT_ENTRY_SOURCES.has(form.channelType) && form.channelType && channelsForType(form.channelType).length > 1 && (
              <SelectField
                aria-label={`${CHANNEL_TYPE_LABELS[form.channelType]} de origen`}
                value={form.acquisitionChannelId}
                onChange={e => updateField('acquisitionChannelId', e.target.value)}
                invalid={errors.acquisitionChannelId}
              >
                <option value="">-- Seleccionar {CHANNEL_TYPE_LABELS[form.channelType]} --</option>
                {channelsForType(form.channelType).map(ch => (
                  <option key={ch.id} value={ch.id}>{ch.name}</option>
                ))}
              </SelectField>
            )}

            {/* Canal resuelto solo cuando hay una única opción */}
            {form.acquisitionChannelId && channelsForType(form.channelType).length === 1 && (
              <p className="settings-note">
                Canal: <span className="text-gold">{channels.find(c => c.id === form.acquisitionChannelId)?.name}</span>
              </p>
            )}

            <FieldError message={errors.acquisitionChannelId} />
          </section>

          {/* Notas */}
          <section className="settings-card">
            <div className="settings-card-head">
              <h2 className="settings-card-title">
                <label htmlFor={id('notes')}>Notas internas</label>
              </h2>
              <span className="pill" data-tone="mute">Opcional</span>
            </div>
            <textarea
              id={id('notes')}
              rows={4}
              maxLength={500}
              placeholder="Añade contexto sobre este lead..."
              value={form.notes}
              onChange={e => updateField('notes', e.target.value)}
              className="settings-input settings-input-wide"
            />
            <div className="form-count">{form.notes.length}/500</div>
          </section>

          <div className="form-footer">
            <button type="button" onClick={() => router.back()} className="btn btn-ghost">
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitDisabled} aria-busy={isSubmitting} className="btn btn-primary">
              <CheckCircle2 size={15} aria-hidden="true" />
              {isSubmitting ? 'Registrando...' : 'Registrar lead'}
            </button>
          </div>
        </form>
          ),
          import: (
        <section className="settings-card">
          {/* PASO 1: plantilla */}
          <p className="step-label">Paso 1 — Descarga la plantilla</p>
          <button type="button" onClick={downloadTemplate} className="btn btn-ghost">
            <Download size={14} aria-hidden="true" />
            Descargar plantilla CSV
          </button>
          <p className="settings-note settings-note-gap">
            Columnas (reconocimiento automático, es/en): nombre · apellido · email · teléfono · idioma · estatus (Nuevo/Cerrado) · prestamista · notas
          </p>

          <hr className="step-sep" />

          {/* PASO 2: archivo */}
          <p className="step-label">Paso 2 — Sube tu archivo completado</p>

          {importStatus !== 'preview' && importStatus !== 'success' && (
            <>
              <div
                role="button"
                tabIndex={0}
                aria-label="Seleccionar archivo CSV o XLSX"
                aria-disabled={importStatus === 'parsing' || undefined}
                onClick={() => { if (importStatus !== 'parsing') fileInputRef.current?.click() }}
                onKeyDown={e => {
                  if ((e.key === 'Enter' || e.key === ' ') && importStatus !== 'parsing') {
                    e.preventDefault()
                    fileInputRef.current?.click()
                  }
                }}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault()
                  setIsDragging(false)
                  const file = e.dataTransfer.files[0]
                  if (file) handleFileUpload(file)
                }}
                data-dragging={isDragging || undefined}
                className="dropzone"
              >
                <FileUp size={32} aria-hidden="true" />
                <span>Arrastra tu archivo aquí, o <span className="text-gold">haz click para seleccionar</span></span>
                <span className="settings-note">Formatos aceptados: .csv · .xlsx — Máximo 500 filas</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  hidden
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file)
                  }}
                />
              </div>

              {importStatus === 'error' && (
                <div role="alert" className="settings-alert settings-alert-block settings-alert-gap">
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>
                    Error al procesar el archivo
                    <span className="settings-note settings-note-gap">{importError}</span>
                  </span>
                </div>
              )}

              {importStatus === 'parsing' && (
                <p role="status" className="settings-note settings-note-gap">Procesando archivo...</p>
              )}
            </>
          )}

          {/* PASO 3: revisión y doble confirmación */}
          {importStatus === 'preview' && parseResult && (
            <>
              <hr className="step-sep" />
              <div className="settings-inline settings-inline-between">
                <p className="step-label">Paso 3 — Revisa y confirma</p>
                <button type="button" onClick={resetImport} className="settings-link-btn">
                  <X size={12} aria-hidden="true" /> Cancelar
                </button>
              </div>

              <p className="import-summary">
                {finalRows.length} se importarán ({newCount} Nuevos · {closedCount} Cerrados) · {parseResult.totalRows} filas en el archivo
              </p>

              {warnings.length > 0 && (
                <div className="settings-note settings-note-gold import-warnings">
                  {warnings.map((w, i) => (
                    <span key={i}><AlertTriangle size={13} aria-hidden="true" />{w}</span>
                  ))}
                </div>
              )}

              <div className="form-field">
                <label htmlFor={id('import-agent')} className="settings-field-label">Agente al que se atribuirán los leads *</label>
                {needsAgentSelector ? (
                  <SelectField id={id('import-agent')} value={importAgentId} onChange={e => setImportAgentId(e.target.value)}>
                    <option value="">-- Seleccionar agente --</option>
                    {visibleAgents.map(a => (
                      <option key={a.id} value={a.id}>{a.avatarInitials} · {a.name}</option>
                    ))}
                  </SelectField>
                ) : (
                  <p id={id('import-agent')} className="agent-preview-name">{attributionAgentName}</p>
                )}
              </div>

              {/* Vista previa de las filas listas para insertar; la caja se
                  desplaza por dentro, la página no. */}
              {finalRows.length > 0 && (
                <div className="mini-table-wrap form-field">
                  <table className="mini-table">
                    <thead>
                      <tr>
                        {['#', 'Nombre', 'Email', 'Teléfono', 'Idioma', 'Prestamista', 'Estatus'].map(col => (
                          <th key={col} scope="col">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {finalRows.slice(0, 50).map((r, i) => (
                        <tr key={`${r.email}-${i}`}>
                          <td>{i + 1}</td>
                          <td className="mini-table-strong">{[r.firstName, r.lastName].filter(Boolean).join(' ') || '—'}</td>
                          <td>{r.email}</td>
                          <td>{r.phone || '—'}</td>
                          <td>{r.language.toUpperCase()}</td>
                          <td>{r.lender || '—'}</td>
                          <td className={r.stage === 'nuevo' ? 'text-gold' : undefined}>{r.stage === 'nuevo' ? 'Nuevo' : 'Cerrado'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {finalRows.length > 50 && (
                <p className="settings-note settings-note-gap">Mostrando 50 de {finalRows.length}.</p>
              )}

              <div className="form-footer">
                <button
                  type="button"
                  onClick={() => downloadFinal(finalRows)}
                  disabled={finalRows.length === 0}
                  className="btn btn-ghost"
                >
                  <Download size={14} aria-hidden="true" />
                  Descargar archivo final ({fileFormat.toUpperCase()})
                </button>

                {!confirming && (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={finalRows.length === 0 || !attributionAgentId}
                    className="btn btn-primary"
                  >
                    Continuar
                  </button>
                )}
              </div>

              {/* Doble confirmación */}
              {confirming && (
                <div className="settings-panel settings-panel-gold form-field">
                  <p className="settings-confirm-text">
                    Se registrarán <strong>{finalRows.length}</strong> leads ({newCount} Nuevos, {closedCount} Cerrados) asignados a <strong>{attributionAgentName}</strong>. Esta acción no se puede deshacer.
                  </p>
                  <div className="settings-actions">
                    <button type="button" onClick={() => handleImport(finalRows, attributionAgentId)} className="btn btn-primary">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      Confirmar e importar {finalRows.length}
                    </button>
                    <button type="button" onClick={() => setConfirming(false)} className="btn btn-ghost">
                      Volver
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Importación terminada */}
          {importStatus === 'success' && (
            <div className="done-card" role="status">
              <span className="empty-card-icon" aria-hidden="true"><CheckCircle2 size={24} /></span>
              <h3 className="done-card-title">Importación completada</h3>
              <p className="done-card-text">{importedCount} lead(s) añadidos al sistema.</p>
              <div className="settings-actions">
                <button type="button" onClick={() => router.push('/leads')} className="btn btn-ghost">
                  ← Ver todos los leads
                </button>
                <button type="button" onClick={resetImport} className="btn btn-primary">
                  + Importar otro archivo
                </button>
              </div>
            </div>
          )}
        </section>
          ),
        }}
      />
    </div>
  )
}
