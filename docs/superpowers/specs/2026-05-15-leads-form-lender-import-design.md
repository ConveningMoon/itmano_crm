# Leads Form: Lender Field + CSV/XLSX Import

**Date:** 2026-05-15  
**File modified:** `src/app/(dashboard)/leads/new/page.tsx` (only)

---

## Overview

Two additions to the `/leads/new` page:

1. A "Prestamista" (Lender) optional text field in the manual registration form.
2. A CSV/XLSX bulk-import tab on the same page.

---

## Change 1 — Lender Field

### Data model

Add `lender: string` to `FormData` interface and `INITIAL_FORM` constant. Keep existing `referralName` field.

### UI placement

Section 1 "Datos del lead", after the language selector. Full-width (`gridColumn: '1 / -1'`), with `Building2` icon at left (same pattern as email/phone fields).

### Success screen

If `form.lender` is non-empty, render one additional `<p>` line in `SuccessScreen` showing `Prestamista: <strong>{form.lender}</strong>`.

---

## Change 2 — Tab Mode Toggle

### State

```typescript
const [mode, setMode] = useState<'manual' | 'import'>('manual')
```

### Rendering

A pill-style tab switcher rendered above the form card, max-width 400px. Uses `PenLine` icon for "Registro Manual" and `Upload` icon for "Importar CSV/XLSX".

- `mode === 'manual'` → show existing form (unchanged except for the lender field addition)
- `mode === 'import'` → show import view

---

## Change 3 — Import View

### State types

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

### State variables

```typescript
const [importStatus, setImportStatus] = useState<ImportStatus>('idle')
const [importedLeads, setImportedLeads] = useState<ImportedLead[]>([])
const [importError, setImportError] = useState<string>('')
const [isDragging, setIsDragging] = useState(false)
const fileInputRef = useRef<HTMLInputElement>(null)
```

### Step 1 — Download template

Client-side CSV blob generation. Columns: `firstName · lastName · email · phone · language · agentId · sourceType · lender · notes`. Includes comment lines (`#`) explaining valid enum values. Download filename: `plantilla_leads_itmano.csv`.

### Step 2 — Upload zone

Drag-and-drop div + hidden `<input type="file" accept=".csv,.xlsx">`. On file select/drop → `handleFileUpload(file)`. Border turns gold while dragging.

### Parser (`handleFileUpload`)

- **CSV:** PapaParse with `{ header: true, skipEmptyLines: true, comments: '#' }` — the `#` option skips template instruction lines.
- **XLSX:** `xlsx` library, reads first sheet, `sheet_to_json({ raw: false })`.
- **Limits:** 0 rows → error, >500 rows → error.
- **Validation per row:** `firstName` required, `email` required + format check, `language` must be in `['es', 'en', 'pt']` if provided, `agentId` must be in `['agent-adriana', 'agent-john', 'agent-melanie', 'agent-viviane']` if provided, `sourceType` must be in valid list if provided.
- Defaults: missing `language` → `'es'`, missing `agentId` → `'agent-adriana'`, missing `sourceType` → `'manual'`.

### Step 3 — Preview table

Shown when `importStatus === 'preview'`. Columns: `# | Nombre | Email | Teléfono | Agente | Idioma | Prestamista | Estado`. Max height 320px with internal scroll. Error rows: coral left border + red background tint. Footer shows valid count and import button. Import button disabled when 0 valid leads.

### Confirm import (Phase 1)

```typescript
function handleConfirmImport() {
  const validLeads = importedLeads.filter(l => !l._hasError)
  console.log('Leads a importar:', validLeads)
  setImportStatus('success')
}
```

No API calls in Phase 1.

### Success screen (import)

Shown when `importStatus === 'success'`. Shows count of imported leads. Two buttons: "Ver todos los leads" (routes to `/leads`) and "Importar otro archivo" (resets to `idle`).

### Error display

Shown when `importStatus === 'error'`. Red-tinted box with `AlertTriangle` icon and `importError` message.

---

## Dependencies

| Package | Purpose | Install command |
|---|---|---|
| `papaparse` | CSV parsing | `npm install papaparse` |
| `xlsx` | XLSX parsing | `npm install xlsx` |
| `@types/papaparse` | TS types | `npm install --save-dev @types/papaparse` |

---

## New imports required

```typescript
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { useRef } from 'react'
import {
  Building2, Upload, PenLine, FileUp, Download, AlertTriangle,
  // existing: ArrowLeft, CheckCircle2, Mail, Phone
} from 'lucide-react'
```

---

## Constraints

- `'use client'` directive stays unchanged.
- `papaparse` and `xlsx` run only in the browser file handler — no server component usage.
- All colors via CSS variables (`var(--accent-gold)`, `var(--bg-elevated)`, etc.).
- `handleConfirmImport` does `console.log` only — no API calls in Phase 1.
- Preview table scrolls internally — page scroll is unaffected.
- `referralName` field is kept (powers existing referral-source conditional input).
