# Leads Form: Lender Field + CSV/XLSX Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional "Prestamista" text field to the manual lead form and a CSV/XLSX bulk-import tab on the same page.

**Architecture:** All changes are confined to a single client component (`src/app/(dashboard)/leads/new/page.tsx`). A `mode` state switches between the existing manual form and a new three-step import view. The CSV/XLSX parser runs entirely in the browser using PapaParse and the `xlsx` library. Phase 1 import confirmation is `console.log`-only — no API calls.

**Tech Stack:** Next.js 16 (App Router, `'use client'`), React 19, TypeScript, PapaParse, xlsx, lucide-react

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `src/app/(dashboard)/leads/new/page.tsx` | All new UI and logic |
| (no new files) | — | — |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json` (via npm)

- [ ] **Step 1: Install runtime packages**

```bash
npm install papaparse xlsx
```

- [ ] **Step 2: Install dev types**

```bash
npm install --save-dev @types/papaparse
```

- [ ] **Step 3: Verify installation**

```bash
npm ls papaparse xlsx
```

Expected output: both packages listed with version numbers, no `UNMET DEPENDENCY` warnings.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add papaparse and xlsx for CSV/XLSX import"
```

---

## Task 2: Update imports, types, and constants

**Files:**
- Modify: `src/app/(dashboard)/leads/new/page.tsx` (lines 1–43)

- [ ] **Step 1: Replace the React import line (currently line 3) to include `useRef`**

Old:
```typescript
import { useState } from 'react'
```

New:
```typescript
import { useState, useRef } from 'react'
```

- [ ] **Step 2: Add library imports after the existing `import { useRouter }` line**

After `import { useRouter } from 'next/navigation'` add:

```typescript
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
```

- [ ] **Step 3: Replace the lucide-react import block (currently lines 7–12)**

Old:
```typescript
import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  Phone,
} from 'lucide-react'
```

New:
```typescript
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
```

- [ ] **Step 4: Add `lender` field to `FormData` interface (after `sourceType`)**

Old:
```typescript
interface FormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  language: Language | ''
  agentId: string
  sourceType: string
  referralName: string
  notes: string
}
```

New:
```typescript
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
```

- [ ] **Step 5: Add `lender: ''` to `INITIAL_FORM` (after `sourceType: ''`)**

Old:
```typescript
const INITIAL_FORM: FormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  language: '',
  agentId: '',
  sourceType: '',
  referralName: '',
  notes: '',
}
```

New:
```typescript
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
```

- [ ] **Step 6: Add import-related types after the `FormErrors` interface**

After the closing `}` of `FormErrors`, add:

```typescript
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
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/(dashboard)/leads/new/page.tsx
git commit -m "feat: add import types and lender field to FormData"
```

---

## Task 3: Add lender field to manual form and SuccessScreen

**Files:**
- Modify: `src/app/(dashboard)/leads/new/page.tsx`

- [ ] **Step 1: Update `SuccessScreen` to show lender if present**

Inside `SuccessScreen`, after the `<p>` that shows `La secuencia de email se activará automáticamente.` (around line 145), add:

```tsx
{form.lender && (
  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
    Prestamista: <strong>{form.lender}</strong>
  </p>
)}
```

- [ ] **Step 2: Add lender input to Section 1 in the form**

In Section 1 "Datos del lead", find the closing `</div>` of the language selector field (the `<div>` that ends around line 386). After that closing `</div>` and before the section's closing `</div style={sectionBodyStyle}>`, add:

```tsx
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
```

Note: Section 1's inner content is rendered in a CSS grid (`gridTemplateColumns: '1fr 1fr'`). The lender field uses `gridColumn: '1 / -1'` to span both columns, matching how email and phone already span full width.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/leads/new/page.tsx
git commit -m "feat: add lender field to manual form and success screen"
```

---

## Task 4: Add mode toggle tabs

**Files:**
- Modify: `src/app/(dashboard)/leads/new/page.tsx`

- [ ] **Step 1: Add `mode` state inside `NewLeadPage`**

Inside `NewLeadPage`, after the existing state declarations (after `const [autoAssigned, setAutoAssigned] = useState(false)`), add:

```typescript
const [mode, setMode] = useState<'manual' | 'import'>('manual')
```

- [ ] **Step 2: Add tab toggle JSX in the return**

In the `return` statement, inside the outer `<div style={{ maxWidth: '640px', ... }}>`, after the `{/* Header */}` block and before the `{/* Form card */}` comment, add:

```tsx
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
```

- [ ] **Step 3: Wrap the form card + footer in a conditional**

Find the `{/* Form card */}` comment and the footer `<div>` that follows the form card. Wrap both in `{mode === 'manual' && ( ... )}`:

```tsx
{mode === 'manual' && (
  <>
    {/* Form card */}
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '16px', overflow: 'hidden' }}>
      {/* ... all existing section content unchanged ... */}
    </div>

    {/* Footer */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
      {/* ... existing cancel and submit buttons unchanged ... */}
    </div>
  </>
)}
```

Add a placeholder for the import view right after:

```tsx
{mode === 'import' && (
  <div>{/* import view — added in Task 6 */}</div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/leads/new/page.tsx
git commit -m "feat: add manual/import mode tabs to leads/new page"
```

---

## Task 5: Add import state variables

**Files:**
- Modify: `src/app/(dashboard)/leads/new/page.tsx`

- [ ] **Step 1: Add import state and ref inside `NewLeadPage`**

After the `mode` state line, add:

```typescript
const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
const [importedLeads, setImportedLeads] = useState<ImportedLead[]>([])
const [importError, setImportError] = useState<string>('')
const [isDragging, setIsDragging] = useState(false)
const fileInputRef = useRef<HTMLInputElement>(null)
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/leads/new/page.tsx
git commit -m "feat: add import state variables"
```

---

## Task 6: Implement `downloadTemplate` + Step 1 UI

**Files:**
- Modify: `src/app/(dashboard)/leads/new/page.tsx`

- [ ] **Step 1: Add `downloadTemplate` function inside `NewLeadPage`** (after the import state declarations, before the `return`)

```typescript
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
```

- [ ] **Step 2: Replace the import view placeholder with the Step 1 section**

Replace the `{mode === 'import' && ( <div>{/* import view */}</div> )}` placeholder with:

```tsx
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

    {/* PASO 2: Upload zone — added in Task 7 */}

  </div>
)}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(dashboard)/leads/new/page.tsx
git commit -m "feat: add import step 1 — template download"
```

---

## Task 7: Implement `handleFileUpload` (CSV + XLSX parser)

**Files:**
- Modify: `src/app/(dashboard)/leads/new/page.tsx`

- [ ] **Step 1: Add `handleFileUpload` inside `NewLeadPage`** (after `downloadTemplate`, before `return`)

```typescript
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
          error: (err: Error) => reject(err),
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
    const validAgentIds = ['agent-adriana', 'agent-john', 'agent-melanie', 'agent-viviane']
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/leads/new/page.tsx
git commit -m "feat: implement CSV/XLSX file parser with row validation"
```

---

## Task 8: Add upload zone (Step 2) and error display

**Files:**
- Modify: `src/app/(dashboard)/leads/new/page.tsx`

- [ ] **Step 1: Replace the `{/* PASO 2: Upload zone — added in Task 7 */}` comment with the upload zone**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/(dashboard)/leads/new/page.tsx
git commit -m "feat: add CSV/XLSX upload zone with drag-and-drop and error display"
```

---

## Task 9: Add preview table (Step 3) and `handleConfirmImport`

**Files:**
- Modify: `src/app/(dashboard)/leads/new/page.tsx`

- [ ] **Step 1: Add `handleConfirmImport` inside `NewLeadPage`** (after `handleFileUpload`, before `return`)

```typescript
function handleConfirmImport() {
  const validLeads = importedLeads.filter(l => !l._hasError)
  console.log('Leads a importar:', validLeads)
  setImportStatus('success')
}
```

- [ ] **Step 2: Add the `agentNames` lookup constant** inside `NewLeadPage` (after `handleConfirmImport`)

```typescript
const agentNames: Record<string, string> = {
  'agent-adriana': 'Adriana',
  'agent-john': 'John',
  'agent-melanie': 'Melanie',
  'agent-viviane': 'Viviane',
}
```

- [ ] **Step 3: Add the preview table and import success screen after the upload zone JSX** (still inside `{mode === 'import' && ( ... )}`, after the upload zone block)

```tsx
{/* PASO 3: Preview table */}
{importStatus === 'preview' && (
  <>
    <hr style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '20px 0' }} />
    <p style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
      Paso 3 — Revisa y confirma
    </p>

    {/* Preview header */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
      <div>
        <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
          {importedLeads.length} leads detectados
        </span>
        {importedLeads.filter(l => l._hasError).length > 0 && (
          <span style={{
            marginLeft: '10px',
            fontSize: '12px',
            color: 'var(--accent-coral)',
            background: 'rgba(201,123,107,0.1)',
            padding: '2px 8px',
            borderRadius: '4px',
          }}>
            ⚠ {importedLeads.filter(l => l._hasError).length} con errores
          </span>
        )}
      </div>
      <button
        onClick={() => { setImportStatus('idle'); setImportedLeads([]) }}
        style={{ fontSize: '12px', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        ✕ Cancelar
      </button>
    </div>

    {/* Preview table */}
    <div style={{ overflowY: 'auto', maxHeight: '320px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr style={{ background: 'var(--bg-elevated)', position: 'sticky', top: 0 }}>
            {['#', 'Nombre', 'Email', 'Teléfono', 'Agente', 'Idioma', 'Prestamista', 'Estado'].map(col => (
              <th key={col} style={{
                padding: '8px 10px',
                textAlign: 'left',
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                fontWeight: 500,
                borderBottom: '1px solid var(--border-subtle)',
                whiteSpace: 'nowrap',
              }}>
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {importedLeads.map((lead) => (
            <tr
              key={lead._rowIndex}
              style={{
                background: lead._hasError ? 'rgba(201,123,107,0.06)' : 'transparent',
                borderLeft: lead._hasError ? '2px solid var(--accent-coral)' : '2px solid transparent',
              }}
            >
              <td style={{ padding: '8px 10px', color: 'var(--text-muted)' }}>{lead._rowIndex}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-primary)' }}>{[lead.firstName, lead.lastName].filter(Boolean).join(' ')}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{lead.email}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{lead.phone || '—'}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{agentNames[lead.agentId] || lead.agentId}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{lead.language.toUpperCase()}</td>
              <td style={{ padding: '8px 10px', color: 'var(--text-secondary)' }}>{lead.lender || '—'}</td>
              <td style={{ padding: '8px 10px' }}>
                {lead._hasError
                  ? <span style={{ color: 'var(--accent-coral)', fontSize: '11px' }}>{lead._errorMessage}</span>
                  : <span style={{ color: 'var(--accent-green)' }}>✓</span>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    {/* Preview footer */}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        {importedLeads.filter(l => !l._hasError).length} leads válidos serán importados
        {importedLeads.filter(l => l._hasError).length > 0 &&
          ` · ${importedLeads.filter(l => l._hasError).length} con errores serán omitidos`}
      </p>
      <button
        onClick={handleConfirmImport}
        disabled={importedLeads.filter(l => !l._hasError).length === 0}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 20px',
          background: 'var(--accent-gold)',
          color: 'var(--bg-base)',
          border: 'none',
          borderRadius: '8px',
          fontSize: '13px',
          fontWeight: 600,
          cursor: importedLeads.filter(l => !l._hasError).length === 0 ? 'not-allowed' : 'pointer',
          opacity: importedLeads.filter(l => !l._hasError).length === 0 ? 0.5 : 1,
        }}
      >
        <CheckCircle2 size={14} />
        Importar {importedLeads.filter(l => !l._hasError).length} leads
      </button>
    </div>
  </>
)}

{/* Import success screen */}
{importStatus === 'success' && (
  <div style={{ textAlign: 'center', padding: '48px 24px' }}>
    <CheckCircle2 size={48} style={{ color: 'var(--accent-green)', marginBottom: '16px' }} />
    <h3 style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-primary)', marginBottom: '8px' }}>
      ¡Importación completada!
    </h3>
    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginBottom: '28px' }}>
      {importedLeads.filter(l => !l._hasError).length} leads han sido añadidos al sistema.
    </p>
    <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
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
        onClick={() => { setImportStatus('idle'); setImportedLeads([]) }}
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
        + Importar otro archivo
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(dashboard)/leads/new/page.tsx
git commit -m "feat: add CSV/XLSX preview table and import success screen"
```

---

## Task 10: Final verification

**Files:**
- Read: `src/app/(dashboard)/leads/new/page.tsx` (confirm structure is correct)

- [ ] **Step 1: Full TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Start dev server and open `/leads/new`**

```bash
npm run dev
```

Open: `http://localhost:3000/leads/new`

- [ ] **Step 3: Manual form — verify lender field**

- Fill in all required fields + lender field ("Navy Federal")
- Click "Registrar lead"
- Confirm success screen shows `Prestamista: Navy Federal`

- [ ] **Step 4: Manual form — verify lender field is optional**

- Fill in required fields only (no lender)
- Click "Registrar lead"
- Confirm success screen shows no "Prestamista" line

- [ ] **Step 5: Tabs — verify toggle**

- Click "Importar CSV/XLSX" tab — form disappears, import view appears
- Click "Registro Manual" tab — form returns, import view disappears

- [ ] **Step 6: Import — verify template download**

- Click "Descargar plantilla CSV"
- Confirm `plantilla_leads_itmano.csv` downloads
- Open it and verify columns and example row are correct

- [ ] **Step 7: Import — verify CSV happy path**

- Upload a valid CSV (no errors expected)
- Confirm preview table shows all rows with ✓ in Status column
- Click "Importar X leads"
- Confirm browser console logs the lead objects
- Confirm success screen appears with correct count

- [ ] **Step 8: Import — verify CSV error rows**

- Upload a CSV with at least one row missing `firstName` and one row with invalid email
- Confirm error rows have coral left border and error message in Status column
- Confirm "Importar X leads" button shows only valid-row count
- Confirm button is disabled (greyed) if 0 valid rows

- [ ] **Step 9: Import — verify drag-and-drop**

- Drag a CSV file onto the upload zone
- Confirm border turns gold while dragging
- Confirm file is parsed on drop

- [ ] **Step 10: Import — verify XLSX**

- Upload a `.xlsx` file (can create from Excel/LibreOffice with the same columns)
- Confirm preview table renders correctly

- [ ] **Step 11: Import — verify 500-row limit**

- Upload a CSV with 501 rows
- Confirm error message: `El archivo tiene 501 filas. El máximo permitido es 500`

- [ ] **Step 12: Import success — verify navigation buttons**

- After import success, click "← Ver todos los leads" — confirm navigation to `/leads`
- After import success, click "+ Importar otro archivo" — confirm upload zone resets to idle

- [ ] **Step 13: Final commit**

```bash
git add src/app/(dashboard)/leads/new/page.tsx
git commit -m "feat: complete leads form lender field and CSV/XLSX import"
```
