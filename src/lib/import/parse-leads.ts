// Pure, framework-free core of the lead CSV/XLSX import: tolerant column
// recognition + row normalization + status mapping + intra-file dedup. The browser
// (new-lead-client) handles the actual file parsing (papaparse / xlsx) and the
// tenant-level "already exists" check (server action); everything here is unit-tested.

export type ImportLeadStatus = 'new' | 'closed'

export interface NormalizedLead {
  firstName: string
  lastName:  string
  email:     string
  phone:     string
  language:  string
  status:    ImportLeadStatus
  lender:    string
  notes:     string
}

export interface ParseLeadsResult {
  rows:                    NormalizedLead[] // valid, intra-file-deduped, insert-ready
  totalRows:               number
  excludedNoEmail:         number
  excludedDuplicateInFile: number
  statusDefaulted:         number           // rows whose status was missing/invalid → 'closed'
  recognizedColumns:       Record<string, string> // canonical field → actual header
  ignoredColumns:          string[]
}

// Canonical field → accepted header aliases (es/en). Compared after normalization
// (lowercase, accent-stripped, non-alphanumerics collapsed).
const FIELD_ALIASES: Record<keyof Omit<NormalizedLead, never>, string[]> = {
  firstName: ['firstname', 'first', 'nombre', 'nombres', 'name'],
  lastName:  ['lastname', 'last', 'surname', 'apellido', 'apellidos'],
  email:     ['email', 'mail', 'correo', 'correoelectronico'],
  phone:     ['phone', 'tel', 'telefono', 'celular', 'movil', 'whatsapp', 'numero'],
  language:  ['language', 'lang', 'idioma', 'lengua'],
  status:    ['status', 'estatus', 'estado'],
  lender:    ['lender', 'prestamista'],
  notes:     ['notes', 'note', 'notas', 'observaciones', 'comentarios'],
}

export function normalizeHeader(h: string): string {
  return h
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // collapse spaces / underscores / punctuation
}

const VALID_LANGUAGES = new Set(['es', 'en', 'pt'])

function mapStatus(raw: string | undefined): { status: ImportLeadStatus; defaulted: boolean } {
  const v = (raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
  if (v === 'nuevo' || v === 'new')    return { status: 'new',    defaulted: false }
  if (v === 'cerrado' || v === 'closed') return { status: 'closed', defaulted: false }
  // Missing or unrecognized → Cerrado (historical contacts default), flagged.
  return { status: 'closed', defaulted: true }
}

function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
}

/**
 * Recognizes columns and normalizes rows. `headers` is the list of column names as
 * they appear in the file (papaparse meta.fields / XLSX first-row keys).
 */
export function parseLeadRows(
  rawRows: Record<string, string>[],
  headers: string[],
): ParseLeadsResult {
  // Resolve each canonical field to the first matching header.
  const recognizedColumns: Record<string, string> = {}
  const usedHeaders = new Set<string>()
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const aliasSet = new Set(aliases)
    const match = headers.find(h => !usedHeaders.has(h) && aliasSet.has(normalizeHeader(h)))
    if (match) {
      recognizedColumns[field] = match
      usedHeaders.add(match)
    }
  }
  const ignoredColumns = headers.filter(h => !usedHeaders.has(h))

  const get = (row: Record<string, string>, field: string): string => {
    const header = recognizedColumns[field]
    return header ? (row[header] ?? '').toString().trim() : ''
  }

  const rows: NormalizedLead[] = []
  const seenEmails = new Set<string>()
  let excludedNoEmail = 0
  let excludedDuplicateInFile = 0
  let statusDefaulted = 0

  for (const raw of rawRows) {
    const email = get(raw, 'email')
    if (!email || !isValidEmail(email)) { excludedNoEmail++; continue }

    const key = email.toLowerCase()
    if (seenEmails.has(key)) { excludedDuplicateInFile++; continue }
    seenEmails.add(key)

    const { status, defaulted } = mapStatus(get(raw, 'status'))
    if (defaulted) statusDefaulted++

    const langRaw = get(raw, 'language').toLowerCase()
    const language = VALID_LANGUAGES.has(langRaw) ? langRaw : 'es' // NOT NULL + CHECK → default

    rows.push({
      firstName: get(raw, 'firstName'),
      lastName:  get(raw, 'lastName'),
      email,
      phone:     get(raw, 'phone'),
      language,
      status,
      lender:    get(raw, 'lender'),
      notes:     get(raw, 'notes'),
    })
  }

  return {
    rows,
    totalRows: rawRows.length,
    excludedNoEmail,
    excludedDuplicateInFile,
    statusDefaulted,
    recognizedColumns,
    ignoredColumns,
  }
}
