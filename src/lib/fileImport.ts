// fileImport.ts
// Parses CSV and Excel statement exports into a uniform { headers, rows } shape,
// then converts rows into transactions using a user-defined column mapping.
// Keeps all file-format quirks out of the Upload page.

import Papa from 'papaparse'

export const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls']

export type RawRow = Record<string, string>

export interface ParsedFile {
  headers: string[]
  rows: RawRow[]
}

export type DateOrder = 'MDY' | 'DMY'

export interface ColumnMapping {
  date: string
  description: string
  // Optional — '' means the file has no category column
  category: string
  // 'single' = one signed amount column, 'split' = separate credit/debit columns
  amountMode: 'single' | 'split'
  amount: string
  credit: string
  debit: string
  // Some banks export spending as positive numbers — flip so expenses are negative
  invertAmounts: boolean
  dateOrder: DateOrder
}

export interface MappedTransaction {
  id: string
  user_id: string | null | undefined
  date: string
  description: string
  category: string | null
  amount: number
}

export function isAcceptedFile(file: File) {
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some(ext => name.endsWith(ext))
}

// ─── Parsing ────────────────────────────────────────────────────────────────

export async function parseFile(file: File): Promise<ParsedFile> {
  const name = file.name.toLowerCase()
  const grid = name.endsWith('.csv') ? await readCsvGrid(file) : await readExcelGrid(file)
  return gridToRows(grid)
}

async function readCsvGrid(file: File): Promise<string[][]> {
  // Strip the byte-order mark some banks prepend, or it ends up in the first header
  const text = (await file.text()).replace(/^\uFEFF/, '')
  return Papa.parse<string[]>(text, { header: false, skipEmptyLines: true }).data
}

async function readExcelGrid(file: File): Promise<string[][]> {
  // SheetJS is large, so only load it when an Excel file is actually uploaded
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(await file.arrayBuffer(), { cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) return []

  // raw: false returns formatted text, so amounts/dates look as they do in Excel
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
    dateNF: 'yyyy-mm-dd',
  })
}

// Many bank exports put account info above the real header row, so treat the
// widest of the first 20 rows as the header and drop anything above it.
function gridToRows(grid: string[][]): ParsedFile {
  const filled = (row: string[]) => row.filter(c => String(c ?? '').trim() !== '').length
  const scan = grid.slice(0, 20)
  const maxFilled = Math.max(0, ...scan.map(filled))
  const headerIndex = scan.findIndex(row => filled(row) === maxFilled)
  if (headerIndex === -1) return { headers: [], rows: [] }

  const headerRow = grid[headerIndex]
  const dataRows = grid.slice(headerIndex + 1).filter(row => filled(row) > 0)

  // Drop columns with no header and no data (trailing blank columns in Excel)
  const keep = headerRow.map((h, i) =>
    String(h ?? '').trim() !== '' || dataRows.some(row => String(row[i] ?? '').trim() !== '')
  )
  const indexes = headerRow.map((_, i) => i).filter(i => keep[i])
  const headers = uniqueHeaders(indexes.map(i => headerRow[i]))

  const rows = dataRows.map(row => {
    const record: RawRow = {}
    headers.forEach((h, j) => { record[h] = String(row[indexes[j]] ?? '').trim() })
    return record
  })

  return { headers, rows }
}

// Blank headers become "Column N"; duplicates get a numeric suffix
function uniqueHeaders(raw: string[]) {
  const seen = new Map<string, number>()
  return raw.map((h, i) => {
    const base = String(h ?? '').trim() || `Column ${i + 1}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base} (${count})`
  })
}

// ─── Mapping ────────────────────────────────────────────────────────────────

// Common header names used by banks, checked in order of preference
const SYNONYMS = {
  date:        ['post date', 'posting date', 'posted date', 'transaction date', 'trans date', 'date'],
  description: ['description', 'payee', 'merchant', 'name', 'memo', 'details', 'narrative', 'transaction'],
  category:    ['category', 'categories', 'spending category', 'budget category'],
  amount:      ['amount', 'transaction amount', 'value', 'net amount'],
  credit:      ['credit', 'credits', 'deposit', 'deposits', 'money in', 'paid in'],
  debit:       ['debit', 'debits', 'withdrawal', 'withdrawals', 'money out', 'paid out'],
}

function findHeader(headers: string[], candidates: string[]) {
  const normalized = headers.map(h => h.toLowerCase().trim())
  // Exact matches first, then partial matches
  for (const c of candidates) {
    const i = normalized.indexOf(c)
    if (i !== -1) return headers[i]
  }
  for (const c of candidates) {
    const i = normalized.findIndex(h => h.includes(c))
    if (i !== -1) return headers[i]
  }
  return ''
}

export function guessMapping(headers: string[], rows: RawRow[]): ColumnMapping {
  const credit = findHeader(headers, SYNONYMS.credit)
  const debit  = findHeader(headers, SYNONYMS.debit)
  const amount = findHeader(headers, SYNONYMS.amount)
  const date   = findHeader(headers, SYNONYMS.date)

  return {
    date,
    description: findHeader(headers, SYNONYMS.description),
    category: findHeader(headers, SYNONYMS.category),
    amountMode: credit && debit && !amount ? 'split' : 'single',
    amount,
    credit,
    debit,
    invertAmounts: false,
    dateOrder: date ? detectDateOrder(rows.map(r => r[date])) : 'MDY',
  }
}

// Saved per set of headers, so the same bank's export maps itself next time
const STORAGE_PREFIX = 'column-mapping:'

function storageKey(headers: string[]) {
  return STORAGE_PREFIX + [...headers].sort().join('|')
}

// Partial because mappings saved before a field existed won't have its key —
// the caller layers this over guessMapping so new fields still get auto-detected
export function loadSavedMapping(headers: string[]): Partial<ColumnMapping> | null {
  try {
    const saved = localStorage.getItem(storageKey(headers))
    if (!saved) return null
    const mapping = JSON.parse(saved) as Partial<ColumnMapping>
    // Ignore if any saved column no longer exists in this file
    const cols = [mapping.date, mapping.description, mapping.category, mapping.amount, mapping.credit, mapping.debit]
    return cols.every(c => !c || headers.includes(c)) ? mapping : null
  } catch {
    return null
  }
}

export function saveMapping(headers: string[], mapping: ColumnMapping) {
  try {
    localStorage.setItem(storageKey(headers), JSON.stringify(mapping))
  } catch {
    // Storage unavailable — mapping just won't be remembered
  }
}

export function mappingIsComplete(m: ColumnMapping) {
  if (!m.date || !m.description) return false
  return m.amountMode === 'single' ? !!m.amount : !!(m.credit || m.debit)
}

export function applyMapping(rows: RawRow[], m: ColumnMapping, userId: string | null | undefined) {
  const transactions: MappedTransaction[] = []
  let skipped = 0

  for (const row of rows) {
    const date = parseDate(row[m.date], m.dateOrder)
    const description = row[m.description]?.trim()
    const category = (m.category && row[m.category]?.trim()) || null
    let amount: number | null

    if (m.amountMode === 'single') {
      amount = parseAmount(row[m.amount])
    } else {
      const credit = m.credit ? parseAmount(row[m.credit]) : null
      const debit  = m.debit  ? parseAmount(row[m.debit])  : null
      // Prefer whichever column has a non-zero value
      amount = credit ? Math.abs(credit)
        : debit ? -Math.abs(debit)
        : credit ?? debit
    }

    if (!date || !description || amount === null) {
      skipped++
      continue
    }

    transactions.push({
      id: crypto.randomUUID(),
      user_id: userId,
      date,
      description,
      category,
      amount: m.invertAmounts ? -amount : amount,
    })
  }

  return { transactions, skipped }
}

// ─── Value parsing ──────────────────────────────────────────────────────────

// Handles "$1,234.56", "(12.00)", "12.00-" and "-£5" style values
export function parseAmount(value: string | undefined): number | null {
  if (!value) return null
  let s = value.trim()
  if (!s) return null

  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1) }
  if (s.endsWith('-'))    { negative = true; s = s.slice(0, -1) }

  s = s.replace(/[^0-9.\-]/g, '')
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1) }

  const n = parseFloat(s)
  if (isNaN(n)) return null
  return negative ? -n : n
}

// If any value has a first part over 12 it must be day-first
export function detectDateOrder(values: string[]): DateOrder {
  for (const v of values) {
    const match = v?.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-]\d{2,4}/)
    if (match && Number(match[1]) > 12) return 'DMY'
  }
  return 'MDY'
}

// Returns YYYY-MM-DD, or null if the value can't be understood
export function parseDate(value: string | undefined, order: DateOrder): string | null {
  if (!value) return null
  const s = value.trim()

  // 2025-01-15 or 2025/01/15, optionally followed by a time
  let match = s.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/)
  if (match) return toIso(+match[1], +match[2], +match[3])

  // 01/15/2025, 15/01/25, 15.01.2025
  match = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/)
  if (match) {
    const [a, b] = [+match[1], +match[2]]
    let year = +match[3]
    if (year < 100) year += 2000
    return order === 'MDY' ? toIso(year, a, b) : toIso(year, b, a)
  }

  // Excel serial date that came through unformatted
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    // Excel counts days from 1899-12-30
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000)
    return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }

  // Last resort for formats like "Jan 15, 2025"
  const parsed = new Date(s)
  if (!isNaN(parsed.getTime())) {
    return toIso(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
  }

  return null
}

function toIso(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
