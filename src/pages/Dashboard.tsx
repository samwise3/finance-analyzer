// Dashboard.tsx
// Shows real results for the selected month against budget goals.
// Budget page is the plan; this page is the actuals.

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { Link } from 'react-router-dom'
import { getSupabaseClient } from '../lib/supabase'
import MonthPicker from '../components/MonthPicker'
import TransactionTable from '../components/TransactionTable'
import './Dashboard.css'

interface SelectedMonth { year: number; month: number }

interface InvestmentAccount {
  type: string
  name: string
  contribution_pct: number
  monthly_contribution: number
  employer_match_cap: number
  employer_match_pct: number
}

interface SavingsBucket {
  id: string
  name: string
  monthly_amount: number
  target_amount: number | null
  from_savings: number
  independent_funds: number
}

interface PlaidAccount {
  institution_name: string
  account_type_label: string
  account_id: string
  name: string
  official_name: string | null
  type: string
  subtype: string
  current: number | null
  available: number | null
  limit: number | null
}

interface CreditLiability {
  account_id: string
  institution_name: string
  name: string
  official_name: string | null
  current: number | null
  available: number | null
  limit: number | null
  minimum_payment: number | null
  next_payment_due_date: string | null
  last_payment_amount: number | null
  last_payment_date: string | null
  last_statement_balance: number | null
  is_overdue: boolean
  purchase_apr: number | null
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
}

function fmtExact(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })
}

export default function Dashboard() {
  const { getToken, userId } = useAuth()
  const now = new Date()

  const [selectedMonth, setSelectedMonth] = useState<SelectedMonth>({
    year: now.getFullYear(), month: now.getMonth(),
  })

  // Transaction data
  const [transactions, setTransactions] = useState<any[]>([])
  const [txLoading, setTxLoading]       = useState(true)

  // Live Plaid account balances
  const [plaidAccounts, setPlaidAccounts]     = useState<PlaidAccount[]>([])
  const [creditLiabilities, setCreditLiabilities] = useState<CreditLiability[]>([])
  const [balancesLoading, setBalancesLoading] = useState(true)

  // Budget plan data (fetched once)
  const [monthlyNet, setMonthlyNet]           = useState(0)
  const [budgetedExpenses, setBudgetedExpenses] = useState(0)
  const [savingsGoalType, setSavingsGoalType] = useState('months_expenses')
  const [savingsGoalValue, setSavingsGoalValue] = useState(3)
  const [savingsTarget, setSavingsTargetState] = useState(0)
  const [investments, setInvestments]         = useState<InvestmentAccount[]>([])
  const [buckets, setBuckets]                 = useState<SavingsBucket[]>([])
  const [allocatingBucketId, setAllocatingBucketId] = useState<string | null>(null)
  const [allocAmount, setAllocAmount]         = useState('')
  const [allocType, setAllocType]             = useState<'from_savings' | 'independent'>('from_savings')
  const [saving, setSaving]                   = useState(false)
  const [budgetLoading, setBudgetLoading]     = useState(true)

  // Pagination
  const PAGE_SIZE = 20
  const [page, setPage] = useState(1)

  useEffect(() => { fetchTransactions() }, [selectedMonth])
  useEffect(() => { setPage(1) }, [selectedMonth])
  useEffect(() => { fetchBudgetPlan(); fetchBalances(); fetchLiabilities() }, [])

  async function fetchTransactions() {
    setTxLoading(true)
    const supabase = await getSupabaseClient(getToken)
    const from = new Date(selectedMonth.year, selectedMonth.month, 1).toISOString().split('T')[0]
    const to   = new Date(selectedMonth.year, selectedMonth.month + 1, 0).toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('transactions').select('*')
      .gte('date', from).lte('date', to)
      .order('date', { ascending: false })
    if (error) console.error(error)
    else setTransactions(data ?? [])
    setTxLoading(false)
  }

  async function fetchBudgetPlan() {
    const supabase = await getSupabaseClient(getToken)
    const [settingsRes, itemsRes, invRes, bucketsRes] = await Promise.all([
      supabase.from('budget_settings').select('*').maybeSingle(),
      supabase.from('budget_items').select('*'),
      supabase.from('investment_accounts').select('*'),
      supabase.from('savings_buckets').select('*').order('created_at', { ascending: true }),
    ])

    if (settingsRes.data) {
      const s         = settingsRes.data
      const gross     = (s.annual_income ?? 0) / 12
      const tax       = s.income_type === 'pre_tax' ? gross * ((s.tax_rate ?? 25) / 100) : 0
      const net       = gross - tax
      setMonthlyNet(net)

      // Compute savings target (same logic as Budget.tsx)
      const recurringExpenses = (itemsRes.data ?? [])
        .filter((i: any) => i.frequency === 'recurring' && i.type === 'expense')
        .reduce((s: number, i: any) => s + i.amount, 0)

      const goalType  = s.savings_goal_type  ?? 'months_expenses'
      const goalValue = s.savings_goal_value ?? 3
      setSavingsGoalType(goalType)
      setSavingsGoalValue(goalValue)

      const target =
        goalType === 'percent'         ? (s.annual_income ?? 0) * (goalValue / 100)
        : goalType === 'flat_annual'   ? goalValue
        : recurringExpenses * goalValue  // months of expenses
      setSavingsTargetState(target)
    }

    const items = itemsRes.data ?? []
    setBudgetedExpenses(
      items.filter((i: any) => i.frequency === 'recurring').reduce((s: number, i: any) => s + i.amount, 0)
    )
    setInvestments(invRes.data ?? [])
    setBuckets(bucketsRes.data ?? [])
    setBudgetLoading(false)
  }

  async function fetchBalances() {
    if (!userId) return
    setBalancesLoading(true)
    try {
      const clerkToken    = await getToken({ template: 'supabase' } as any)
      const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL
      const res = await fetch(`${FUNCTIONS_URL}/plaid-get-balances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${clerkToken}`,
        },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) { setBalancesLoading(false); return }
      const data = await res.json()
      setPlaidAccounts(data.accounts ?? [])
    } catch (err) {
      console.error('fetchBalances error:', err)
    }
    setBalancesLoading(false)
  }

  async function fetchLiabilities() {
    if (!userId) return
    try {
      const clerkToken    = await getToken({ template: 'supabase' } as any)
      const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL
      const res = await fetch(`${FUNCTIONS_URL}/plaid-get-liabilities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${clerkToken}` },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) return
      const data = await res.json()
      setCreditLiabilities(data.credit ?? [])
    } catch (err) {
      console.error('fetchLiabilities error:', err)
    }
  }

  async function handleAllocate(bucket: SavingsBucket) {
    const amount = parseFloat(allocAmount)
    if (isNaN(amount) || amount <= 0) return
    setSaving(true)
    const supabase = await getSupabaseClient(getToken)
    const update = allocType === 'from_savings'
      ? { from_savings: bucket.from_savings + amount }
      : { independent_funds: bucket.independent_funds + amount }
    const { error } = await supabase.from('savings_buckets').update(update).eq('id', bucket.id)
    if (!error) {
      setBuckets(prev => prev.map(b => b.id === bucket.id ? { ...b, ...update } : b))
      setAllocAmount('')
      setAllocatingBucketId(null)
    }
    setSaving(false)
  }

  // ── Actual derived values ──
  const actualIncome  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const actualSpent   = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const remaining     = actualIncome - actualSpent   // assumed to go to savings
  const count         = transactions.length

  // Budget vs actual
  const spendingDelta      = budgetedExpenses - actualSpent   // positive = under budget
  const spendingProgress   = budgetedExpenses > 0 ? Math.min(actualSpent / budgetedExpenses, 1.5) : 0
  const overBudget         = actualSpent > budgetedExpenses

  // Monthly investments (planned — we don't track actual investment transactions)
  const monthlyGross    = monthlyNet > 0 ? monthlyNet / (1 - 0) : 0   // rough gross for 401k calc
  const totalInvested   = investments.reduce((sum, a) => {
    if (a.type === '401k') return sum + (monthlyNet * (a.contribution_pct / 100))
    return sum + (a.monthly_contribution ?? 0)
  }, 0)

  // Monthly savings goal
  const monthlySavingsGoal =
    savingsGoalType === 'flat_annual' ? savingsTarget / 12
    : savingsGoalType === 'percent'   ? monthlyNet * (savingsGoalValue / 100)
    : savingsTarget / 12  // months_expenses: rough monthly equivalent

  const savingsOnTrack    = remaining >= monthlySavingsGoal
  const savingsProgress   = monthlySavingsGoal > 0 ? Math.min(remaining / monthlySavingsGoal, 1) : 0

  // Pagination
  const totalPages  = Math.ceil(transactions.length / PAGE_SIZE)
  const paginated   = transactions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const isCurrentMonth = selectedMonth.year === now.getFullYear() && selectedMonth.month === now.getMonth()

  return (
    <div className="page">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <MonthPicker year={selectedMonth.year} month={selectedMonth.month} onSelect={(y, m) => setSelectedMonth({ year: y, month: m })} />
      </div>

      {txLoading ? <p className="dashboard-loading">Loading...</p> : (
        <>
          {/* ══ SECTION: Monthly Activity ══ */}
          <div className="dash-section-header">
            <span className="dash-section-label">This Month</span>
            <span className="dash-section-desc">Based on transactions imported for the selected period</span>
          </div>

          {/* ── Summary bar ── */}
          <div className="dash-summary">
            <div className="dash-summary-col">
              <span className="dash-summary-label">Income</span>
              <span className="dash-summary-value ds-income">{fmtExact(actualIncome)}</span>
            </div>
            <span className="dash-summary-op">−</span>
            <div className="dash-summary-col">
              <span className="dash-summary-label">Spent</span>
              <span className="dash-summary-value ds-spent">{fmtExact(actualSpent)}</span>
            </div>
            <span className="dash-summary-op">=</span>
            <div className="dash-summary-col">
              <span className="dash-summary-label">Remaining this month</span>
              <span className={`dash-summary-value ${remaining >= 0 ? 'ds-pos' : 'ds-neg'}`}>{fmtExact(remaining)}</span>
            </div>
            {!budgetLoading && totalInvested > 0 && (
              <>
                <div className="dash-summary-divider" />
                <div className="dash-summary-col">
                  <span className="dash-summary-label">Investments (planned)</span>
                  <span className="dash-summary-value ds-invest">{fmt(totalInvested)}/mo</span>
                </div>
              </>
            )}
            <div className="dash-summary-bar-wrap">
              <div className="dash-summary-bar-fill" style={{
                width: actualIncome > 0 ? `${Math.min((actualSpent / actualIncome) * 100, 100)}%` : '0%',
                background: actualSpent > actualIncome ? '#f87171' : '#4ade80',
              }} />
            </div>
          </div>

          {/* ── Three-column: spending | savings | investments ── */}
          {!budgetLoading && (
            <div className="dash-cards-row">

              {/* Budget vs Actual */}
              <div className="dash-card">
                <div className="dash-card-title">Spending this month</div>
                <div className="dash-card-amount">{fmtExact(actualSpent)}</div>
                {budgetedExpenses > 0 && (
                  <>
                    <div className="dash-vs-row">
                      <span className="dash-vs-label">Monthly budget</span>
                      <span className="dash-vs-value">{fmt(budgetedExpenses)}</span>
                    </div>
                    <div className="dash-mini-bar-wrap">
                      <div className="dash-mini-bar-fill" style={{
                        width: `${Math.min(spendingProgress * 100, 100)}%`,
                        background: overBudget ? '#f87171' : '#4ade80',
                      }} />
                      {spendingProgress > 1 && (
                        <div className="dash-mini-bar-overflow" style={{
                          width: `${Math.min((spendingProgress - 1) * 100, 50)}%`,
                        }} />
                      )}
                    </div>
                    <div className={`dash-card-status ${overBudget ? 'status-over' : 'status-under'}`}>
                      <span className="dash-card-status-dot" />
                      {overBudget
                        ? `${fmtExact(Math.abs(spendingDelta))} over budget`
                        : `${fmtExact(spendingDelta)} under budget`}
                    </div>
                  </>
                )}
                {budgetedExpenses === 0 && (
                  <p className="dash-card-hint">
                    <Link to="/budget">Set a budget →</Link>
                  </p>
                )}
              </div>

              {/* Remaining this month → assumed saved */}
              <div className="dash-card">
                <div className="dash-card-title">Remaining this month</div>
                <div className={`dash-card-amount ${remaining < 0 ? 'ds-neg' : ''}`}>{fmtExact(Math.max(remaining, 0))}</div>
                <p className="dash-card-note" style={{ marginBottom: '0.5rem' }}>
                  Income minus spending — assumed to go toward savings
                </p>
                <div className="dash-vs-row">
                  <span className="dash-vs-label">Monthly savings goal</span>
                  <span className="dash-vs-value">{monthlySavingsGoal > 0 ? fmt(monthlySavingsGoal) : '—'}</span>
                </div>
                {monthlySavingsGoal > 0 && (
                  <>
                    <div className="dash-mini-bar-wrap">
                      <div className="dash-mini-bar-fill" style={{
                        width: `${savingsProgress * 100}%`,
                        background: savingsOnTrack ? '#4ade80' : '#fbbf24',
                      }} />
                    </div>
                    <div className={`dash-card-status ${savingsOnTrack ? 'status-under' : 'status-warn'}`}>
                      <span className="dash-card-status-dot" />
                      {savingsOnTrack ? 'On track' : 'Below monthly goal'}
                    </div>
                  </>
                )}
                {monthlySavingsGoal === 0 && (
                  <p className="dash-card-hint">
                    <Link to="/budget">Set a savings goal →</Link>
                  </p>
                )}
              </div>

              {/* Investments */}
              <div className="dash-card">
                <div className="dash-card-title">Investments (planned)</div>
                <div className="dash-card-amount ds-invest">{fmt(totalInvested)}</div>
                <div className="dash-vs-row">
                  <span className="dash-vs-label">Per month, from budget plan</span>
                </div>
                {investments.length > 0 ? (
                  <div className="dash-inv-list">
                    {investments.map((a: any, i) => (
                      <div key={i} className="dash-inv-row">
                        <span className="dash-inv-name">{a.name}</span>
                        <span className="dash-inv-amount">
                          {fmt(a.type === '401k'
                            ? monthlyNet * (a.contribution_pct / 100)
                            : a.monthly_contribution)}/mo
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="dash-card-hint">
                    <Link to="/budget">Add investment accounts →</Link>
                  </p>
                )}
              </div>

            </div>
          )}

          {/* ══ SECTION: Account Balances ══ */}
          {!balancesLoading && plaidAccounts.length > 0 && (
            <div className="dash-section-header">
              <span className="dash-section-label">Account Balances</span>
              <span className="dash-section-desc">Live balances from your connected accounts — independent of the month selected above</span>
            </div>
          )}

          {/* ── Credit cards ── */}
          {(() => {
            if (balancesLoading) return (
              <div className="cc-section">
                <div className="cc-section-header"><h2>Credit Cards</h2></div>
                <p className="dashboard-loading">Fetching balances...</p>
              </div>
            )
            if (creditLiabilities.length === 0) return (
              <div className="cc-section">
                <div className="cc-section-header"><h2>Credit Cards</h2></div>
                <div className="cc-empty">
                  <div>
                    <p className="cc-empty-title">No credit cards connected</p>
                    <p className="cc-empty-sub">Connect a credit card to track balances, utilization, and payment due dates.</p>
                  </div>
                  <Link to="/connect" className="btn-primary" style={{ textDecoration: 'none' }}>Connect credit card</Link>
                </div>
              </div>
            )

            const totalOwed  = creditLiabilities.reduce((s, a) => s + (a.current ?? 0), 0)
            const totalLimit = creditLiabilities.reduce((s, a) => s + (a.limit  ?? 0), 0)
            const anyOverdue = creditLiabilities.some(a => a.is_overdue)

            return (
              <div className="cc-section">
                <div className="cc-section-header">
                  <h2>Credit Cards</h2>
                  <div className="cc-header-totals">
                    <div className="cc-header-total">
                      <span className="cc-header-label">Total owed</span>
                      <span className="cc-header-value">{fmtExact(totalOwed)}</span>
                    </div>
                    {totalLimit > 0 && (
                      <div className="cc-header-total">
                        <span className="cc-header-label">Total limit</span>
                        <span className="cc-header-value cc-limit">{fmt(totalLimit)}</span>
                      </div>
                    )}
                    {anyOverdue && (
                      <span className="cc-overdue-badge">Payment overdue</span>
                    )}
                  </div>
                </div>

                <div className="cc-cards-grid">
                  {creditLiabilities.map(acct => {
                    const owed  = acct.current  ?? 0
                    const avail = acct.available ?? 0
                    const limit = acct.limit     ?? (owed + avail)
                    const util  = limit > 0 ? owed / limit : 0
                    const utilColor = util > 0.5 ? '#f87171' : util > 0.3 ? '#fbbf24' : '#4ade80'

                    const dueDate = acct.next_payment_due_date
                      ? new Date(acct.next_payment_due_date + 'T00:00:00')
                      : null
                    const daysUntilDue = dueDate
                      ? Math.ceil((dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                      : null
                    const dueSoon = daysUntilDue !== null && daysUntilDue <= 7 && daysUntilDue >= 0

                    return (
                      <div key={acct.account_id} className={`cc-card ${acct.is_overdue ? 'cc-card-overdue' : ''}`}>
                        <div className="cc-card-top">
                          <div className="cc-card-name-block">
                            <span className="cc-institution">{acct.institution_name}</span>
                            <span className="cc-name">{acct.official_name ?? acct.name}</span>
                          </div>
                          <div className="cc-card-badges">
                            {acct.is_overdue && <span className="cc-badge-overdue">Overdue</span>}
                            {acct.purchase_apr != null && (
                              <span className="cc-badge-apr">{acct.purchase_apr.toFixed(2)}% APR</span>
                            )}
                          </div>
                        </div>

                        {/* Balances */}
                        <div className="cc-balance-row">
                          <div className="cc-balance-block">
                            <span className="cc-balance-label">Balance owed</span>
                            <span className="cc-balance-value">{fmtExact(owed)}</span>
                          </div>
                          {acct.last_statement_balance != null && (
                            <div className="cc-balance-block">
                              <span className="cc-balance-label">Statement balance</span>
                              <span className="cc-balance-value cc-limit">{fmtExact(acct.last_statement_balance)}</span>
                            </div>
                          )}
                          {limit > 0 && (
                            <div className="cc-balance-block">
                              <span className="cc-balance-label">Available</span>
                              <span className="cc-balance-value cc-avail">{fmtExact(avail)}</span>
                            </div>
                          )}
                        </div>

                        {/* Utilization bar */}
                        {limit > 0 && (
                          <>
                            <div className="cc-util-bar-wrap">
                              <div className="cc-util-bar-fill" style={{ width: `${Math.min(util * 100, 100)}%`, background: utilColor }} />
                            </div>
                            <div className="cc-util-label">
                              <span style={{ color: utilColor }}>{(util * 100).toFixed(0)}% of {fmt(limit)} limit</span>
                              {util > 0.3 && (
                                <span className="cc-util-note">
                                  {util > 0.5 ? 'High utilization' : 'Moderate utilization'}
                                </span>
                              )}
                            </div>
                          </>
                        )}

                        {/* Payment info */}
                        <div className="cc-payment-row">
                          {acct.minimum_payment != null && (
                            <div className="cc-payment-block">
                              <span className="cc-balance-label">Min. payment</span>
                              <span className="cc-payment-value">{fmtExact(acct.minimum_payment)}</span>
                            </div>
                          )}
                          {dueDate && (
                            <div className="cc-payment-block">
                              <span className="cc-balance-label">Due date</span>
                              <span className={`cc-payment-value ${acct.is_overdue ? 'cc-due-overdue' : dueSoon ? 'cc-due-soon' : ''}`}>
                                {dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                {dueSoon && !acct.is_overdue && ` (${daysUntilDue}d)`}
                              </span>
                            </div>
                          )}
                          {acct.last_payment_amount != null && (
                            <div className="cc-payment-block">
                              <span className="cc-balance-label">Last payment</span>
                              <span className="cc-payment-value cc-avail">
                                {fmtExact(acct.last_payment_amount)}
                                {acct.last_payment_date && (
                                  <span className="cc-payment-date">
                                    {' '}· {new Date(acct.last_payment_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* ── Savings accounts ── */}
          {(() => {
            const savingsAccounts = plaidAccounts.filter(
              a => a.type === 'depository' && ['savings', 'money market', 'hsa'].includes(a.subtype)
            )
            if (balancesLoading) return (
              <div className="cc-section">
                <div className="cc-section-header"><h2>Savings</h2></div>
                <p className="dashboard-loading">Fetching balances...</p>
              </div>
            )
            if (savingsAccounts.length === 0 && buckets.length === 0) return null

            const totalSavings      = savingsAccounts.reduce((s, a) => s + (a.current ?? 0), 0)
            const totalFromSavings  = buckets.reduce((s, b) => s + b.from_savings, 0)
            const generalSavings    = totalSavings - totalFromSavings
            const overAllocated     = totalFromSavings > totalSavings && totalSavings > 0

            // Savings goal comparison — general savings vs target
            const goalMet     = savingsTarget > 0 && generalSavings >= savingsTarget
            const goalProgress = savingsTarget > 0 ? Math.min(generalSavings / savingsTarget, 1) : null

            return (
              <div className="cc-section">
                <div className="cc-section-header">
                  <h2>Savings</h2>
                  {totalSavings > 0 && (
                    <div className="cc-header-total">
                      <span className="cc-header-label">Total balance</span>
                      <span className="cc-header-value" style={{ color: '#4ade80' }}>{fmtExact(totalSavings)}</span>
                    </div>
                  )}
                </div>

                {overAllocated && (
                  <div className="savings-over-warning">
                    Bucket allocations ({fmtExact(totalFromSavings)}) exceed your savings balance ({fmtExact(totalSavings)}). Reduce allocations below.
                  </div>
                )}

                {/* General savings row */}
                <div className="savings-general-row">
                  <div className="savings-general-label">
                    <span className="sbd-name">General Savings</span>
                    {buckets.length > 0 && totalSavings > 0 && (
                      <span className="sbd-alloc">total balance minus bucket allocations</span>
                    )}
                  </div>
                  <div className="savings-general-right">
                    <span className="savings-general-value" style={{ color: generalSavings < 0 ? '#f87171' : '#4ade80' }}>
                      {fmtExact(Math.max(generalSavings, 0))}
                    </span>
                    {savingsTarget > 0 && (
                      <span className="savings-general-goal">goal: {fmt(savingsTarget)}</span>
                    )}
                  </div>
                </div>

                {/* Goal progress */}
                {goalProgress !== null && (
                  <div className="savings-goal-progress">
                    <div className="cc-util-bar-wrap">
                      <div className="cc-util-bar-fill" style={{
                        width: `${goalProgress * 100}%`,
                        background: goalMet ? '#4ade80' : '#fbbf24',
                      }} />
                    </div>
                    <div className="savings-goal-progress-labels">
                      <div className={`dash-card-status ${goalMet ? 'status-under' : 'status-warn'}`} style={{ display: 'inline-flex' }}>
                        <span className="dash-card-status-dot" />
                        {goalMet
                          ? 'Savings goal met'
                          : `${fmt(savingsTarget - generalSavings)} below goal`}
                      </div>
                      <span className="bucket-months-left">
                        {(goalProgress * 100).toFixed(0)}% of {fmt(savingsTarget)} target
                      </span>
                    </div>
                  </div>
                )}

                {/* Bucket rows */}
                {buckets.length > 0 && (
                  <div className="savings-buckets-dash">
                    {buckets.map(b => {
                      const bucketTotal  = b.from_savings + b.independent_funds
                      const progress     = b.target_amount && b.target_amount > 0
                        ? Math.min(bucketTotal / b.target_amount, 1) : null
                      const monthsLeft   = b.target_amount && b.monthly_amount > 0 && bucketTotal < b.target_amount
                        ? Math.ceil((b.target_amount - bucketTotal) / b.monthly_amount) : null
                      const isOpen       = allocatingBucketId === b.id

                      return (
                        <div key={b.id} className="savings-bucket-dash-row">
                          <div className="sbd-top">
                            <div className="sbd-name-block">
                              <span className="sbd-name">{b.name}</span>
                              {b.monthly_amount > 0 && <span className="sbd-alloc">{fmt(b.monthly_amount)}/mo planned</span>}
                            </div>
                            <div className="sbd-right">
                              <div className="sbd-amounts">
                                <span className="sbd-balance sbd-ok">{fmtExact(bucketTotal)}</span>
                                {b.target_amount && (
                                  <span className="sbd-of-target"> of {fmt(b.target_amount)}</span>
                                )}
                              </div>
                              <button
                                className="sbd-alloc-btn"
                                onClick={() => {
                                  setAllocatingBucketId(isOpen ? null : b.id)
                                  setAllocAmount('')
                                  setAllocType('from_savings')
                                }}
                              >
                                {isOpen ? 'Cancel' : '+ Add funds'}
                              </button>
                            </div>
                          </div>

                          {/* Breakdown of sources */}
                          {bucketTotal > 0 && (
                            <div className="sbd-sources">
                              {b.from_savings > 0 && (
                                <span className="sbd-source-chip sbd-source-savings">
                                  {fmtExact(b.from_savings)} from savings
                                </span>
                              )}
                              {b.independent_funds > 0 && (
                                <span className="sbd-source-chip sbd-source-independent">
                                  {fmtExact(b.independent_funds)} independent
                                </span>
                              )}
                            </div>
                          )}

                          {/* Allocation form */}
                          {isOpen && (
                            <div className="sbd-alloc-form">
                              <div className="sbd-type-toggle">
                                <button
                                  className={`sbd-type-btn ${allocType === 'from_savings' ? 'active' : ''}`}
                                  onClick={() => setAllocType('from_savings')}
                                >
                                  From savings
                                </button>
                                <button
                                  className={`sbd-type-btn ${allocType === 'independent' ? 'active' : ''}`}
                                  onClick={() => setAllocType('independent')}
                                >
                                  Independent funds
                                </button>
                              </div>
                              <p className="sbd-type-hint">
                                {allocType === 'from_savings'
                                  ? 'Deducted from your savings account balance above.'
                                  : 'Added to this bucket only — does not affect your savings balance.'}
                              </p>
                              <div className="sbd-alloc-input-row">
                                <div className="bt-amount-wrap">
                                  <span className="bt-amount-prefix">$</span>
                                  <input
                                    className="bt-input bt-amount-input"
                                    type="number" min="0" placeholder="0"
                                    value={allocAmount}
                                    autoFocus
                                    onChange={e => setAllocAmount(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') handleAllocate(b) }}
                                  />
                                </div>
                                <button className="btn-primary btn-sm" onClick={() => handleAllocate(b)} disabled={saving || !allocAmount}>
                                  {saving ? '...' : 'Save'}
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Progress bar */}
                          {progress !== null && (
                            <>
                              <div className="cc-util-bar-wrap">
                                <div className="cc-util-bar-fill" style={{
                                  width: `${progress * 100}%`,
                                  background: progress >= 1 ? '#4ade80' : '#60a5fa',
                                }} />
                              </div>
                              <div className="sbd-progress-label">
                                <span style={{ color: progress >= 1 ? '#4ade80' : '#8b90a0' }}>
                                  {progress >= 1 ? 'Goal reached ✓' : `${(progress * 100).toFixed(0)}%`}
                                </span>
                                {monthsLeft !== null && b.monthly_amount > 0 && (
                                  <span className="bucket-months-left">~{monthsLeft} months at {fmt(b.monthly_amount)}/mo</span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {savingsAccounts.length === 0 && (
                  <p className="cc-score-note">
                    Connect a savings account on the <Link to="/connect">Connect Bank</Link> page to see live balances here.
                  </p>
                )}
              </div>
            )
          })()}

          {/* ── Transactions ── */}
          <div className="dash-section-header">
            <span className="dash-section-label">Transactions</span>
            <span className="dash-section-desc">All transactions for the selected month</span>
          </div>
          <div className="dashboard-recent">
            <div className="dashboard-recent-header">
              <h2>
                Transactions
                <span className="dash-tx-count">{count}</span>
              </h2>
            </div>

            {transactions.length === 0 ? (
              <p className="dashboard-empty">
                No transactions for this month.{' '}
                <Link to="/upload">Upload a CSV</Link> or{' '}
                <Link to="/connect">connect a bank account</Link>.
              </p>
            ) : (
              <>
                <TransactionTable transactions={paginated} />
                {totalPages > 1 && (
                  <div className="dash-pagination">
                    <button onClick={() => setPage(p => p - 1)} disabled={page === 1}>← Prev</button>
                    <span>{page} of {totalPages}</span>
                    <button onClick={() => setPage(p => p + 1)} disabled={page === totalPages}>Next →</button>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
