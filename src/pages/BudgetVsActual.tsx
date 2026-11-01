// BudgetVsActual.tsx
// Compares each planned expense from the budget against what was actually
// spent in the selected month. Transaction categories come from bank imports
// and rarely match budget item names, so users map each category to a
// budget item, Other, a written-in bucket, or exclude it in the mapping panel
// below the table. Uncategorized transactions are listed and mapped one by one.
// Category rows expand to show their transactions, each of which inherits the
// category's mapping but can be overridden individually.
// Credits (refunds, people paying you back) are listed too: once mapped they
// reduce that bucket's spending. Unmapped credits are ignored so income
// doesn't silently offset spending.
// Transactions marked as Paycheck / Income are summed and compared against
// expected paycheck deposits (take-home minus paycheck deductions) and against
// total spending. Deductions are shown but never subtracted from income received.

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/react'
import { getSupabaseClient } from '../lib/supabase'
import {
  loadMappings, saveMappings, suggestMapping, customTarget, customName, looksLikePaycheck,
  UNCATEGORIZED, INCOME, OTHER, EXCLUDE,
} from '../lib/categoryMapping'
import type { CategoryMappings, MappingTarget } from '../lib/categoryMapping'
import { fetchPaycheckSummary } from '../lib/paycheck'
import type { DeductionLine } from '../lib/paycheck'
import MonthPicker from '../components/MonthPicker/MonthPicker'
import './BudgetVsActual.css'

interface BudgetItem {
  id: string
  name: string
  amount: number
  type: 'expense' | 'savings' | 'investment'
  frequency: 'recurring' | 'one_off'
}

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  category: string | null
}

// One line in the mapping panel — either a whole category, or a single
// uncategorized transaction
interface MappingRow {
  key: string
  kind: 'category' | 'transaction'
  category: string
  description: string
  // Every distinct description in the group, for the hover tooltip
  allDescriptions: string[]
  date?: string
  total: number
  count: number
  target: MappingTarget | undefined
  // True when the target came from name matching, not a saved choice
  suggested: boolean
  // Category rows only: the transactions in the group, and how many have
  // their own mapping instead of the category's
  transactions: Transaction[]
  overrideCount: number
}

// A row in the comparison table that isn't a budget item
interface ExtraBucket {
  target: MappingTarget
  name: string
  actual: number
}

const WRITE_IN = '__write_in__'

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtCents(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

// Spending as a positive number, so debits add to a bucket and credits reduce it
function spendOf(t: Transaction) {
  return -t.amount
}

// Shows money coming back as a green "+$20" instead of a negative spend
function SpendAmount({ value, cents = false }: { value: number; cents?: boolean }) {
  const format = cents ? fmtCents : fmt
  return value < 0
    ? <span className="bva-num bva-credit">+{format(-value)}</span>
    : <span className="bva-num">{format(value)}</span>
}

// Parse as local time — new Date('YYYY-MM-DD') is UTC and can show the day before
function formatDate(iso: string) {
  return new Date(iso + 'T00:00').toLocaleDateString()
}

// YYYY-MM-DD without going through UTC, which can shift the day
function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export default function BudgetVsActual() {
  const { getToken, userId } = useAuth()

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState({ year: now.getFullYear(), month: now.getMonth() })
  const [items, setItems]               = useState<BudgetItem[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [mappings, setMappings]         = useState<CategoryMappings>({ categories: {}, transactions: {} })
  // Mapping row currently showing the write-in text box, and its draft text
  const [writingKey, setWritingKey]     = useState<string | null>(null)
  const [writeInText, setWriteInText]   = useState('')
  // Category rows currently expanded to show their transactions
  const [expanded, setExpanded]         = useState<Set<string>>(new Set())
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  // What paychecks should deposit each month, and what's taken out beforehand
  const [expectedDeposits, setExpectedDeposits] = useState(0)
  const [deductions, setDeductions]       = useState<DeductionLine[]>([])
  const [totalDeductions, setTotalDeductions] = useState(0)

  useEffect(() => {
    if (userId) setMappings(loadMappings(userId))
  }, [userId])

  useEffect(() => { fetchBudgetItems() }, [])
  useEffect(() => { fetchTransactions() }, [selectedMonth])

  async function fetchBudgetItems() {
    const supabase = await getSupabaseClient(getToken)
    const [itemsRes, paycheck] = await Promise.all([
      supabase.from('budget_items').select('*')
        .eq('type', 'expense').eq('frequency', 'recurring')
        .order('created_at', { ascending: true }),
      fetchPaycheckSummary(supabase),
    ])
    if (itemsRes.error) { console.error(itemsRes.error); setError('Failed to load your budget.') }
    else setItems(itemsRes.data ?? [])

    setExpectedDeposits(paycheck.expectedDeposits)
    setDeductions(paycheck.lines)
    setTotalDeductions(paycheck.totalDeductions)
  }

  async function fetchTransactions() {
    setLoading(true)
    const supabase = await getSupabaseClient(getToken)
    const { year, month } = selectedMonth
    const lastDay = new Date(year, month + 1, 0).getDate()
    const { data, error } = await supabase
      .from('transactions').select('id, date, description, amount, category')
      .gte('date', isoDate(year, month, 1))
      .lte('date', isoDate(year, month, lastDay))
    if (error) { console.error(error); setError('Failed to load transactions.') }
    else setTransactions(data ?? [])
    setLoading(false)
  }

  function handleMappingChange(row: MappingRow, target: string) {
    if (!userId) return
    if (target === WRITE_IN) {
      setWritingKey(row.key)
      setWriteInText(customName(row.target) ?? '')
      return
    }
    const group = row.kind === 'category' ? 'categories' : 'transactions'
    const id = row.kind === 'category' ? row.category : row.key
    const updated = { ...mappings[group] }
    if (target) updated[id] = target
    else delete updated[id]
    const next = { ...mappings, [group]: updated }
    setMappings(next)
    saveMappings(userId, next)
  }

  function toggleExpanded(key: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // A transaction inside a category, as a row of its own so it can be mapped
  // individually. Its target is only its own override — empty means inherit.
  function childRow(t: Transaction): MappingRow {
    const override = mappings.transactions[t.id]
    return {
      key: t.id,
      kind: 'transaction',
      category: t.category ?? UNCATEGORIZED,
      description: t.description,
      allDescriptions: [t.description],
      date: t.date,
      total: spendOf(t),
      count: 1,
      target: isValidTarget(override) ? override : undefined,
      suggested: false,
      transactions: [],
      overrideCount: 0,
    }
  }

  function handleWriteInSave(row: MappingRow) {
    const name = writeInText.trim()
    setWritingKey(null)
    setWriteInText('')
    if (name) handleMappingChange(row, customTarget(name))
  }

  // Saved targets are valid unless they point at a budget item that was deleted
  const itemIds = useMemo(() => new Set(items.map(i => i.id)), [items])
  function isValidTarget(target: MappingTarget | undefined) {
    if (!target) return false
    return target === EXCLUDE || target === OTHER || target === INCOME
      || customName(target) !== null || itemIds.has(target)
  }

  // Group categorized spending by category, and list each uncategorized
  // transaction on its own. Saved choice first, then a name-match suggestion.
  const mappingRows = useMemo<MappingRow[]>(() => {
    const groups = new Map<string, Transaction[]>()
    const uncategorized: Transaction[] = []
    for (const t of transactions) {
      const category = t.category?.trim()
      if (!category) { uncategorized.push(t); continue }
      groups.set(category, [...(groups.get(category) ?? []), t])
    }

    const categoryRows: MappingRow[] = [...groups.entries()].map(([category, txns]) => {
      const allDescriptions = [...new Set(txns.map(t => t.description?.trim()).filter(Boolean))]
      const saved = mappings.categories[category]
      const suggestion = isValidTarget(saved) ? undefined : suggestMapping(category, items)
      return {
        key: `category:${category}`,
        kind: 'category',
        category,
        description: allDescriptions.length > 2
          ? `${allDescriptions.slice(0, 2).join(', ')} +${allDescriptions.length - 2} more`
          : allDescriptions.join(', '),
        allDescriptions,
        total: txns.reduce((s, t) => s + spendOf(t), 0),
        count: txns.length,
        target: isValidTarget(saved) ? saved : suggestion,
        suggested: !!suggestion,
        transactions: [...txns].sort((a, b) => a.date.localeCompare(b.date)),
        overrideCount: txns.filter(t => isValidTarget(mappings.transactions[t.id])).length,
      }
    })

    const transactionRows: MappingRow[] = uncategorized.map(t => {
      const saved = mappings.transactions[t.id]
      return {
        key: t.id,
        kind: 'transaction',
        category: UNCATEGORIZED,
        description: t.description,
        allDescriptions: [t.description],
        date: t.date,
        total: spendOf(t),
        count: 1,
        // Direct deposits are pre-marked as income until the user picks something
        target: isValidTarget(saved) ? saved : looksLikePaycheck(t.description, t.amount) ? INCOME : undefined,
        suggested: !isValidTarget(saved) && looksLikePaycheck(t.description, t.amount),
        transactions: [],
        overrideCount: 0,
      }
    })

    // Categories by spend, then uncategorized lines by date
    return [
      ...categoryRows.sort((a, b) => b.total - a.total),
      ...transactionRows.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    ]
  }, [transactions, items, mappings, itemIds])

  // Tally per transaction so individual overrides win over their category
  const actualByTarget = new Map<MappingTarget, number>()
  let unmappedTotal = 0
  let unmappedCount = 0
  let actualIncome = 0
  function tally(target: MappingTarget | undefined, spend: number) {
    if (target === EXCLUDE) return
    if (target === INCOME) { actualIncome -= spend; return }
    if (target) actualByTarget.set(target, (actualByTarget.get(target) ?? 0) + spend)
    // Unmapped credits are skipped — they could be income, not a reimbursement
    else if (spend > 0) { unmappedTotal += spend; unmappedCount++ }
  }
  for (const r of mappingRows) {
    if (r.kind === 'transaction') { tally(r.target, r.total); continue }
    for (const t of r.transactions) {
      const override = mappings.transactions[t.id]
      tally(isValidTarget(override) ? override : r.target, spendOf(t))
    }
  }

  // Written-in buckets (alphabetical) then Other, shown below the budget items
  const extraBuckets: ExtraBucket[] = [...actualByTarget.entries()]
    .filter(([target]) => customName(target) !== null)
    .map(([target, actual]) => ({ target, name: customName(target)!, actual }))
    .sort((a, b) => a.name.localeCompare(b.name))
  if (actualByTarget.has(OTHER)) {
    extraBuckets.push({ target: OTHER, name: 'Other', actual: actualByTarget.get(OTHER)! })
  }

  // Every written-in name the user has saved, so they can be reused
  const customNames = [...new Set(
    [...Object.values(mappings.categories), ...Object.values(mappings.transactions)]
      .map(customName)
      .filter((n): n is string => n !== null)
  )].sort((a, b) => a.localeCompare(b))

  const totalPlanned  = items.reduce((s, i) => s + i.amount, 0)
  const totalActual   = [...actualByTarget.values()].reduce((s, n) => s + n, 0) + unmappedTotal

  // Dropdown (or write-in box) for choosing what a row maps to. For a
  // transaction inside an expanded category, pass the category as parent: the
  // dropdown shows the category's mapping until overridden, and picking the
  // category's mapping again clears the override.
  function renderPicker(row: MappingRow, parent?: MappingRow) {
    const inheriting = !!parent && !row.target
    const value = row.target ?? parent?.target ?? ''
    return (
      // Keep clicks in the picker from toggling the row open/closed
      <div className="bva-map-select-wrap" onClick={e => e.stopPropagation()}>
        {writingKey === row.key ? (
          <input
            className="bva-select bva-write-in"
            placeholder="Name this category"
            autoFocus
            value={writeInText}
            onChange={e => setWriteInText(e.target.value)}
            onBlur={() => handleWriteInSave(row)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleWriteInSave(row)
              if (e.key === 'Escape') { setWritingKey(null); setWriteInText('') }
            }}
          />
        ) : (
          <select
            className={`bva-select ${!value ? 'bva-select--empty' : ''} ${inheriting && value ? 'bva-select--inherit' : ''}`}
            value={value}
            onChange={e => {
              const target = e.target.value
              handleMappingChange(row, parent && target === (parent.target ?? '') ? '' : target)
            }}
          >
            <option value="">— Not mapped —</option>
            <optgroup label="Budget items">
              {items.map(i => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </optgroup>
            {customNames.length > 0 && (
              <optgroup label="Your categories">
                {customNames.map(n => (
                  <option key={n} value={customTarget(n)}>{n}</option>
                ))}
              </optgroup>
            )}
            <option value={INCOME}>Paycheck / Income</option>
            <option value={OTHER}>Other</option>
            <option value={WRITE_IN}>Write in…</option>
            <option value={EXCLUDE}>Exclude from budget</option>
          </select>
        )}
        {row.suggested && <span className="bva-auto" title="Matched by name — choose a different item to override">auto</span>}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="bva-header">
        <h1>Budget vs Actual</h1>
        <MonthPicker
          year={selectedMonth.year}
          month={selectedMonth.month}
          onSelect={(year, month) => setSelectedMonth({ year, month })}
        />
      </div>

      {error && <p className="bva-error">{error}</p>}

      {/* ── Income vs spending ── */}
      <div className="bva-summary">
        <div className="bva-stat">
          <span className="bva-stat-label">Income received</span>
          <span className="bva-stat-value bva-credit">{fmt(actualIncome)}</span>
          <span className="bva-stat-sub">
            {expectedDeposits > 0
              ? <>of {fmt(expectedDeposits)} expected · <span className={actualIncome < expectedDeposits ? 'bva-over' : 'bva-under'}>
                  {actualIncome < expectedDeposits ? `${fmt(expectedDeposits - actualIncome)} short` : `${fmt(actualIncome - expectedDeposits)} over`}
                </span></>
              : 'Set your income on the Budget page'}
          </span>
        </div>
        <div className="bva-stat">
          <span className="bva-stat-label">Spent</span>
          <span className="bva-stat-value">{fmt(totalActual)}</span>
          <span className="bva-stat-sub">
            {actualIncome > 0 ? `${Math.round((totalActual / actualIncome) * 100)}% of income` : 'Mark paychecks below to compare'}
          </span>
        </div>
        <div className="bva-stat">
          <span className="bva-stat-label">Left over</span>
          <span className={`bva-stat-value ${actualIncome - totalActual < 0 ? 'bva-over' : 'bva-under'}`}>
            {actualIncome - totalActual < 0 ? `-${fmt(totalActual - actualIncome)}` : fmt(actualIncome - totalActual)}
          </span>
          <span className="bva-stat-sub">Income minus spending</span>
        </div>
        <div className="bva-stat">
          <span className="bva-stat-label">Paycheck deductions</span>
          <span className="bva-stat-value bva-deduction">{fmt(totalDeductions)}</span>
          {deductions.length > 0 ? (
            <ul className="bva-deduction-list">
              {deductions.map(d => (
                <li key={d.key}><span>{d.name}</span><span>{fmt(d.amount)}</span></li>
              ))}
            </ul>
          ) : (
            <span className="bva-stat-sub">Taken out before deposit · add on the Budget page</span>
          )}
        </div>
      </div>

      {/* ── Planned vs actual table ── */}
      <div className="bva-card">
        <div className="bva-row bva-head">
          <span>Budget category</span>
          <span className="bva-num">Planned</span>
          <span className="bva-num">Actual</span>
          <span className="bva-num">Difference</span>
          <span>Used</span>
        </div>

        {items.length === 0 && !loading && (
          <div className="bva-empty">No recurring expenses in your budget yet. Add some on the Budget page.</div>
        )}

        {items.map(item => {
          const actual = actualByTarget.get(item.id) ?? 0
          const diff   = item.amount - actual
          const pct    = item.amount > 0 ? actual / item.amount : actual > 0 ? 1 : 0
          return (
            <div key={item.id} className="bva-row">
              <span className="bva-name">{item.name}</span>
              <span className="bva-num">{fmt(item.amount)}</span>
              <span className="bva-num">{fmt(actual)}</span>
              <span className={`bva-num ${diff < 0 ? 'bva-over' : 'bva-under'}`}>
                {diff < 0 ? `-${fmt(-diff)}` : fmt(diff)}
              </span>
              <div className="bva-bar" title={`${Math.round(pct * 100)}%`}>
                <div
                  className={`bva-bar-fill ${pct > 1 ? 'bva-bar-fill--over' : ''}`}
                  style={{ width: `${Math.min(pct, 1) * 100}%` }}
                />
              </div>
            </div>
          )
        })}

        {extraBuckets.map(b => (
          <div key={b.target} className="bva-row bva-row--extra">
            <span className="bva-name">{b.name}</span>
            <span className="bva-num">—</span>
            <span className="bva-num">{fmt(b.actual)}</span>
            <span className="bva-num bva-over">-{fmt(b.actual)}</span>
            <span className="bva-hint">Not in budget</span>
          </div>
        ))}

        {unmappedTotal > 0 && (
          <div className="bva-row bva-row--unmapped">
            <span className="bva-name">Unmapped spending</span>
            <span className="bva-num">—</span>
            <span className="bva-num">{fmt(unmappedTotal)}</span>
            <span className="bva-num">—</span>
            <span className="bva-hint bva-hint--warn">Map below</span>
          </div>
        )}

        <div className="bva-row bva-total">
          <span>Total</span>
          <span className="bva-num">{fmt(totalPlanned)}</span>
          <span className="bva-num">{fmt(totalActual)}</span>
          <span className={`bva-num ${totalPlanned - totalActual < 0 ? 'bva-over' : 'bva-under'}`}>
            {totalPlanned - totalActual < 0 ? `-${fmt(totalActual - totalPlanned)}` : fmt(totalPlanned - totalActual)}
          </span>
          <span />
        </div>
      </div>

      {/* ── Category mapping ── */}
      <div className="bva-mapping">
        <div className="bva-mapping-header">
          <h2>Category mapping</h2>
          <p>
            Match the categories on your transactions to your budget items.
            Click a category to see its transactions and change any of them individually.
            Map credits (like someone paying you back) to the item they offset, and mark paychecks
            as Paycheck / Income — unmapped credits aren't counted.
            {unmappedCount > 0 && ` ${unmappedCount} transaction${unmappedCount === 1 ? '' : 's'} still unmapped this month.`}
          </p>
        </div>

        <div className="bva-card">
          <div className="bva-map-row bva-head">
            <span>Category</span>
            <span>Description</span>
            <span className="bva-num">Spent</span>
            <span>Maps to</span>
          </div>

          {loading && <div className="bva-empty">Loading...</div>}
          {!loading && mappingRows.length === 0 && (
            <div className="bva-empty">No transactions found for this month.</div>
          )}

          {!loading && mappingRows.map(row => {
            const isOpen = expanded.has(row.key)
            const expandable = row.kind === 'category'
            return (
              <div key={row.key}>
                <div
                  className={[
                    'bva-map-row',
                    row.kind === 'transaction' ? 'bva-map-row--txn' : '',
                    expandable ? 'bva-map-row--expandable' : '',
                  ].join(' ')}
                  onClick={expandable ? () => toggleExpanded(row.key) : undefined}
                >
                  <span className="bva-name">
                    {expandable && <span className={`bva-chevron ${isOpen ? 'bva-chevron--open' : ''}`}>▸</span>}
                    {row.category}
                    {row.kind === 'category'
                      ? <span className="bva-count">{row.count} txn{row.count === 1 ? '' : 's'}</span>
                      : row.date && <span className="bva-count">{formatDate(row.date)}</span>}
                    {row.overrideCount > 0 && <span className="bva-changed">{row.overrideCount} changed</span>}
                  </span>
                  <span className="bva-desc" title={row.allDescriptions.join('\n')}>
                    {row.description || '—'}
                  </span>
                  <SpendAmount value={row.total} />
                  {renderPicker(row)}
                </div>

                {isOpen && row.transactions.map(t => {
                  const child = childRow(t)
                  return (
                    <div key={t.id} className={`bva-map-row bva-map-row--child ${child.target ? 'bva-map-row--overridden' : ''}`}>
                      <span className="bva-name bva-child-date">{formatDate(t.date)}</span>
                      <span className="bva-desc" title={t.description}>{t.description || '—'}</span>
                      <SpendAmount value={spendOf(t)} cents />
                      {renderPicker(child, row)}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
