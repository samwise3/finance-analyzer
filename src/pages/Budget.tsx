// Budget.tsx
// Income, savings goals, investment tracking, and monthly expense budget.

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@clerk/react'
import { getSupabaseClient } from '../lib/supabase'
import './Budget.css'

type ItemType       = 'expense' | 'savings' | 'investment'
type Frequency      = 'recurring' | 'one_off'
type IncomeType     = 'pre_tax' | 'post_tax'
type InvestmentType = '401k' | 'ira' | 'other'
type IraType        = 'roth' | 'traditional'
type TargetType     = 'percent' | 'amount'
type ProgressView   = 'cy' | 'ytd'
// Savings goal can be % of income, flat annual contribution, or X months of expenses
type SavingsGoalType = 'percent' | 'flat_annual' | 'months_expenses'

interface BudgetItem {
  id: string
  name: string
  amount: number
  type: ItemType
  frequency: Frequency
}

interface InvestmentAccount {
  id: string
  name: string
  type: InvestmentType
  contribution_pct: number
  employer_match_pct: number
  employer_match_cap: number
  monthly_contribution: number
  ira_type: IraType | null
}

const TYPE_LABELS: Record<ItemType, string> = {
  expense: 'Expense', savings: 'Savings', investment: 'Investment',
}
const TYPES: ItemType[] = ['expense', 'savings', 'investment']

const EMPTY_ROW = { name: '', amount: '', type: 'expense' as ItemType, frequency: 'recurring' as Frequency }
const EMPTY_INV = {
  name: '', type: '401k' as InvestmentType, ira_type: 'roth' as IraType,
  contribution_pct: '', employer_match_pct: '', employer_match_cap: '', monthly_contribution: '',
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
}

function calc401k(acc: InvestmentAccount, monthlyGross: number) {
  const yours    = monthlyGross * (acc.contribution_pct / 100)
  const matched  = Math.min(acc.contribution_pct, acc.employer_match_cap)
  const employer = monthlyGross * (matched / 100) * (acc.employer_match_pct / 100)
  return { yours, employer, total: yours + employer }
}

export default function Budget() {
  const { getToken, userId } = useAuth()

  // ── Income ──
  const [annualIncome, setAnnualIncome]   = useState(0)
  const [incomeType, setIncomeType]       = useState<IncomeType>('post_tax')
  const [taxRate, setTaxRate]             = useState(25)
  const [editingIncome, setEditingIncome] = useState(false)
  const [incomeInput, setIncomeInput]     = useState('')
  const [taxInput, setTaxInput]           = useState('25')
  const [savingIncome, setSavingIncome]   = useState(false)

  // ── Budget items ──
  const [items, setItems]               = useState<BudgetItem[]>([])
  const [newRow, setNewRow]             = useState(EMPTY_ROW)
  const [adding, setAdding]             = useState(false)
  const [deletingId, setDeletingId]     = useState<string | null>(null)
  const [deleting, setDeleting]         = useState(false)
  const nameInputRef                    = useRef<HTMLInputElement>(null)

  // ── Savings goal ──
  const [savingsGoalType, setSavingsGoalType]         = useState<SavingsGoalType>('months_expenses')
  const [savingsGoalValue, setSavingsGoalValue]       = useState(3)
  const [editingSavings, setEditingSavings]           = useState(false)
  const [savingsGoalTypeInput, setSavingsGoalTypeInput] = useState<SavingsGoalType>('months_expenses')
  const [savingsGoalValueInput, setSavingsGoalValueInput] = useState('3')
  const [savingSavingsGoal, setSavingSavingsGoal]     = useState(false)

  // ── Investments target ──
  const [invTargetType, setInvTargetType]     = useState<TargetType>('percent')
  const [invTargetValue, setInvTargetValue]   = useState(20)
  const [editingInvTarget, setEditingInvTarget] = useState(false)
  const [invTargetTypeInput, setInvTargetTypeInput] = useState<TargetType>('percent')
  const [invTargetValueInput, setInvTargetValueInput] = useState('20')
  const [savingInvTarget, setSavingInvTarget] = useState(false)
  const [progressView, setProgressView]       = useState<ProgressView>('cy')


  // ── Investment accounts ──
  const [investments, setInvestments]         = useState<InvestmentAccount[]>([])
  const [showInvForm, setShowInvForm]         = useState(false)
  const [newInv, setNewInv]                   = useState(EMPTY_INV)
  const [addingInv, setAddingInv]             = useState(false)
  const [deletingInvId, setDeletingInvId]     = useState<string | null>(null)
  const [deletingInv, setDeletingInv]         = useState(false)

  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    const supabase = await getSupabaseClient(getToken)
    const [settingsRes, itemsRes, invRes] = await Promise.all([
      supabase.from('budget_settings').select('*').maybeSingle(),
      supabase.from('budget_items').select('*').order('created_at', { ascending: true }),
      supabase.from('investment_accounts').select('*').order('created_at', { ascending: true }),
    ])

    if (settingsRes.data) {
      const s = settingsRes.data
      setAnnualIncome(s.annual_income ?? 0)
      setIncomeType(s.income_type ?? 'post_tax')
      setTaxRate(s.tax_rate ?? 25)
      setIncomeInput(String(s.annual_income ?? ''))
      setTaxInput(String(s.tax_rate ?? 25))

      const invTType  = s.savings_target_type  ?? 'percent'
      const invTValue = s.savings_target_value ?? 20
      setInvTargetType(invTType)
      setInvTargetValue(invTValue)
      setInvTargetTypeInput(invTType)
      setInvTargetValueInput(String(invTValue))

      const sGoalType  = s.savings_goal_type  ?? 'months_expenses'
      const sGoalValue = s.savings_goal_value ?? 3
      setSavingsGoalType(sGoalType)
      setSavingsGoalValue(sGoalValue)
      setSavingsGoalTypeInput(sGoalType)
      setSavingsGoalValueInput(String(sGoalValue))
    }

    setItems(itemsRes.data ?? [])
    setInvestments(invRes.data ?? [])
    setLoading(false)
  }

  // ── Income ──
  async function handleSaveIncome() {
    const annual = parseFloat(incomeInput)
    const tax    = parseFloat(taxInput)
    if (isNaN(annual) || annual < 0) return
    setSavingIncome(true)
    const supabase = await getSupabaseClient(getToken)
    await supabase.from('budget_settings').upsert(
      { user_id: userId, annual_income: annual, monthly_income: annual / 12,
        income_type: incomeType, tax_rate: isNaN(tax) ? 25 : tax },
      { onConflict: 'user_id' }
    )
    setAnnualIncome(annual)
    setTaxRate(isNaN(tax) ? 25 : tax)
    setEditingIncome(false)
    setSavingIncome(false)
  }

  // ── Savings goal ──
  async function handleSaveSavingsGoal() {
    const value = parseFloat(savingsGoalValueInput)
    if (isNaN(value) || value < 0) return
    setSavingSavingsGoal(true)
    const supabase = await getSupabaseClient(getToken)
    await supabase.from('budget_settings').upsert(
      { user_id: userId, savings_goal_type: savingsGoalTypeInput, savings_goal_value: value },
      { onConflict: 'user_id' }
    )
    setSavingsGoalType(savingsGoalTypeInput)
    setSavingsGoalValue(value)
    setEditingSavings(false)
    setSavingSavingsGoal(false)
  }

  // ── Investments target ──
  async function handleSaveInvTarget() {
    const value = parseFloat(invTargetValueInput)
    if (isNaN(value) || value < 0) return
    setSavingInvTarget(true)
    const supabase = await getSupabaseClient(getToken)
    await supabase.from('budget_settings').upsert(
      { user_id: userId, savings_target_type: invTargetTypeInput, savings_target_value: value },
      { onConflict: 'user_id' }
    )
    setInvTargetType(invTargetTypeInput)
    setInvTargetValue(value)
    setEditingInvTarget(false)
    setSavingInvTarget(false)
  }

  // ── Budget items ──
  async function handleAddRow() {
    if (!newRow.name.trim() || !newRow.amount) return
    setAdding(true)
    const supabase = await getSupabaseClient(getToken)
    const { data, error } = await supabase.from('budget_items')
      .insert({ user_id: userId, name: newRow.name.trim(),
        amount: parseFloat(newRow.amount), type: newRow.type, frequency: newRow.frequency })
      .select().single()
    if (!error && data) {
      setItems(prev => [...prev, data])
      setNewRow(EMPTY_ROW)
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
    setAdding(false)
  }

  async function handleDeleteItem(id: string) {
    setDeleting(true)
    const supabase = await getSupabaseClient(getToken)
    const { error } = await supabase.from('budget_items').delete().eq('id', id)
    if (!error) setItems(prev => prev.filter(i => i.id !== id))
    setDeletingId(null)
    setDeleting(false)
  }

  // ── Investment accounts ──
  async function handleAddInvestment() {
    if (!newInv.name.trim()) return
    setAddingInv(true)
    const supabase = await getSupabaseClient(getToken)
    const payload: any = { user_id: userId, name: newInv.name.trim(), type: newInv.type }
    if (newInv.type === '401k') {
      payload.contribution_pct   = parseFloat(newInv.contribution_pct)   || 0
      payload.employer_match_pct = parseFloat(newInv.employer_match_pct) || 0
      payload.employer_match_cap = parseFloat(newInv.employer_match_cap) || 0
    } else {
      payload.monthly_contribution = parseFloat(newInv.monthly_contribution) || 0
      if (newInv.type === 'ira') payload.ira_type = newInv.ira_type
    }
    const { data, error } = await supabase.from('investment_accounts').insert(payload).select().single()
    if (!error && data) { setInvestments(prev => [...prev, data]); setNewInv(EMPTY_INV); setShowInvForm(false) }
    setAddingInv(false)
  }

  async function handleDeleteInvestment(id: string) {
    setDeletingInv(true)
    const supabase = await getSupabaseClient(getToken)
    const { error } = await supabase.from('investment_accounts').delete().eq('id', id)
    if (!error) setInvestments(prev => prev.filter(i => i.id !== id))
    setDeletingInvId(null)
    setDeletingInv(false)
  }

  // ── Derived values ──
  const monthlyGross   = annualIncome / 12
  const taxAmount      = incomeType === 'pre_tax' ? monthlyGross * (taxRate / 100) : 0
  const monthlyNet     = monthlyGross - taxAmount

  const recurringItems     = items.filter(i => i.frequency === 'recurring')
  const oneOffItems        = items.filter(i => i.frequency === 'one_off')
  const monthlyExpenses    = recurringItems.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0)
  const totalRecurring     = recurringItems.reduce((s, i) => s + i.amount, 0)
  const totalOneOff        = oneOffItems.reduce((s, i) => s + i.amount, 0)
  const totalItems         = totalRecurring + totalOneOff

  const totalInvested = investments.reduce((sum, acc) => {
    if (acc.type === '401k') return sum + calc401k(acc, monthlyGross).yours
    return sum + (acc.monthly_contribution ?? 0)
  }, 0)
  const totalEmployerMatch = investments
    .filter(a => a.type === '401k')
    .reduce((sum, a) => sum + calc401k(a, monthlyGross).employer, 0)

  const totalAllocated = totalItems + totalInvested
  const remaining      = monthlyNet - totalAllocated

  // ── Savings goal derived ──
  const monthlySavingsContrib = items.filter(i => i.type === 'savings').reduce((s, i) => s + i.amount, 0)

  // Savings target in dollars (used for goal display label)
  const savingsTarget =
    savingsGoalType === 'percent'      ? annualIncome * (savingsGoalValue / 100)
    : savingsGoalType === 'flat_annual' ? savingsGoalValue
    : monthlyExpenses * savingsGoalValue

  // ── Investment overview derived ──
  const totalMonthlySavings = monthlySavingsContrib + totalInvested
  const annualSavings       = totalMonthlySavings * 12
  const savingsRate         = monthlyNet > 0 ? (totalMonthlySavings / monthlyNet) * 100 : 0

  const annualInvTarget = invTargetType === 'percent'
    ? monthlyNet * 12 * (invTargetValue / 100)
    : invTargetValue

  const cyProgress  = annualInvTarget > 0 ? Math.min(annualSavings / annualInvTarget, 1) : 0
  const invOnTrack  = annualSavings >= annualInvTarget

  const monthsElapsed  = new Date().getMonth() + 1
  const ytdSaved       = totalMonthlySavings * monthsElapsed
  const ytdTarget      = annualInvTarget * (monthsElapsed / 12)
  const ytdProgress    = ytdTarget > 0 ? Math.min(ytdSaved / ytdTarget, 1) : 0
  const ytdOnTrack     = ytdSaved >= ytdTarget

  const activeProgress = progressView === 'cy' ? cyProgress  : ytdProgress
  const activeOnTrack  = progressView === 'cy' ? invOnTrack  : ytdOnTrack

  const SAVINGS_GOAL_LABELS: Record<SavingsGoalType, string> = {
    percent:        `${savingsGoalValue}% of income`,
    flat_annual:    `${fmt(savingsGoalValue)}/yr`,
    months_expenses: `${savingsGoalValue} months of expenses`,
  }

  return (
    <div className="page">
      <h1>Budget</h1>

      {/* ── Income card ── */}
      <div className="income-card">
        <div className="income-card-top">
          <div className="income-card-title">Annual Income</div>
          <div className="income-type-toggle">
            <button className={`income-type-btn ${incomeType === 'post_tax' ? 'active' : ''}`} onClick={() => setIncomeType('post_tax')}>Post-tax</button>
            <button className={`income-type-btn ${incomeType === 'pre_tax'  ? 'active' : ''}`} onClick={() => setIncomeType('pre_tax')}>Pre-tax</button>
          </div>
        </div>

        {editingIncome ? (
          <div className="income-edit-row">
            <div className="income-field">
              <label>Annual income</label>
              <div className="income-input-wrap">
                <span className="income-prefix">$</span>
                <input className="income-input" type="number" value={incomeInput}
                  onChange={e => setIncomeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveIncome() }} autoFocus />
              </div>
            </div>
            {incomeType === 'pre_tax' && (
              <div className="income-field">
                <label>Effective tax rate</label>
                <div className="income-input-wrap">
                  <input className="income-input income-input--short" type="number" value={taxInput}
                    onChange={e => setTaxInput(e.target.value)} min="0" max="100" />
                  <span className="income-suffix">%</span>
                </div>
              </div>
            )}
            <div className="income-edit-actions">
              <button className="btn-primary" onClick={handleSaveIncome} disabled={savingIncome}>{savingIncome ? 'Saving...' : 'Save'}</button>
              <button className="btn-secondary" onClick={() => setEditingIncome(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="income-display" onClick={() => { setEditingIncome(true); setIncomeInput(String(annualIncome || '')) }}>
            <span className="income-display-value">{annualIncome ? fmt(annualIncome) : 'Set your income'}</span>
            <span className="income-edit-hint">✎</span>
          </button>
        )}

        {annualIncome > 0 && (
          <div className="income-breakdown">
            <div className="breakdown-item">
              <span className="breakdown-label">Monthly gross</span>
              <span className="breakdown-value">{fmt(monthlyGross)}</span>
            </div>
            {incomeType === 'pre_tax' && (
              <>
                <div className="breakdown-divider" />
                <div className="breakdown-item">
                  <span className="breakdown-label">Est. taxes ({taxRate}%)</span>
                  <span className="breakdown-value breakdown-value--tax">−{fmt(taxAmount)}</span>
                </div>
              </>
            )}
            <div className="breakdown-divider" />
            <div className="breakdown-item">
              <span className="breakdown-label">Monthly take-home</span>
              <span className="breakdown-value breakdown-value--net">{fmt(monthlyNet)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Summary bar ── */}
      {annualIncome > 0 && !loading && (
        <div className="budget-summary">
          <div className="summary-col">
            <span className="summary-label">Take-home</span>
            <span className="summary-value">{fmt(monthlyNet)}</span>
          </div>
          <span className="summary-op">−</span>
          <div className="summary-col">
            <span className="summary-label">Expenses</span>
            <span className="summary-value">{fmt(totalItems)}</span>
          </div>
          <span className="summary-op">−</span>
          <div className="summary-col">
            <span className="summary-label">Investing</span>
            <span className="summary-value summary-invest">{fmt(totalInvested)}</span>
          </div>
          <span className="summary-op">=</span>
          <div className="summary-col">
            <span className="summary-label">Remaining</span>
            <span className={`summary-value ${remaining >= 0 ? 'summary-pos' : 'summary-neg'}`}>{fmt(remaining)}</span>
          </div>
          {monthlyNet > 0 && (
            <div className="summary-bar-wrap">
              <div className="summary-bar-fill"
                style={{ width: `${Math.min((totalAllocated / monthlyNet) * 100, 100)}%`,
                  background: remaining < 0 ? '#f87171' : '#4ade80' }} />
            </div>
          )}
        </div>
      )}

      {/* ── Savings goal ── */}
      {!loading && (
        <div className="budget-table-section">
          <div className="budget-table-header">
            <h2>Savings Goal</h2>
          </div>
          <div className="savings-goal-simple">
            <div className="sgs-goal-display">
              <div className="sgs-goal-block">
                <span className="sgs-goal-label">
                  {savingsGoalType === 'months_expenses' ? 'Emergency fund target'
                    : savingsGoalType === 'percent' ? 'Savings rate target'
                    : 'Annual savings target'}
                </span>
                <span className="sgs-goal-value">
                  {savingsGoalType === 'percent'
                    ? `${savingsGoalValue}% of income`
                    : savingsGoalType === 'months_expenses'
                      ? `${savingsGoalValue} months of expenses`
                      : fmt(savingsGoalValue)}
                </span>
                {savingsTarget > 0 && savingsGoalType !== 'flat_annual' && (
                  <span className="sgs-goal-equiv">= {fmt(savingsTarget)}</span>
                )}
              </div>
              <button className="sov-edit-target-btn" onClick={() => setEditingSavings(v => !v)}>
                {editingSavings ? 'Cancel' : '✎ Edit goal'}
              </button>
            </div>

            {editingSavings && (
              <div className="sov-target-editor" style={{ marginTop: '1rem' }}>
                <div className="income-type-toggle">
                  {(['months_expenses', 'flat_annual', 'percent'] as SavingsGoalType[]).map(t => (
                    <button key={t}
                      className={`income-type-btn ${savingsGoalTypeInput === t ? 'active' : ''}`}
                      onClick={() => setSavingsGoalTypeInput(t)}>
                      {t === 'months_expenses' ? 'Months of expenses' : t === 'flat_annual' ? 'Flat annual' : '% of income'}
                    </button>
                  ))}
                </div>
                <div className="sov-target-input-wrap">
                  {savingsGoalTypeInput === 'flat_annual' && <span className="income-prefix">$</span>}
                  <input className="income-input" type="number" min="0"
                    value={savingsGoalValueInput}
                    onChange={e => setSavingsGoalValueInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveSavingsGoal() }}
                    placeholder={savingsGoalTypeInput === 'months_expenses' ? '3' : savingsGoalTypeInput === 'percent' ? '10' : '10000'}
                    style={{ width: 90 }} autoFocus />
                  {savingsGoalTypeInput === 'percent'         && <span className="income-suffix">% of income</span>}
                  {savingsGoalTypeInput === 'months_expenses' && <span className="income-suffix">months of expenses</span>}
                </div>
                <button className="btn-primary" onClick={handleSaveSavingsGoal} disabled={savingSavingsGoal}>
                  {savingSavingsGoal ? 'Saving...' : 'Save'}
                </button>
              </div>
            )}

            <p className="sgs-hint">
              Progress toward this goal is tracked on the <a href="/dashboard">Dashboard</a> using your live account balance.
            </p>
          </div>
        </div>
      )}

      {/* ── Investments overview ── */}
      {annualIncome > 0 && !loading && (totalInvested > 0) && (
        <div className="savings-overview">
          <div className="sov-header">
            <span className="sov-title">Investments</span>
            <button className="sov-edit-target-btn"
              onClick={() => { setEditingInvTarget(v => !v); setInvTargetTypeInput(invTargetType); setInvTargetValueInput(String(invTargetValue)) }}>
              {editingInvTarget ? 'Cancel' : `Target: ${invTargetType === 'percent' ? `${invTargetValue}% of income` : fmt(invTargetValue) + '/yr'} ✎`}
            </button>
          </div>

          {editingInvTarget && (
            <div className="sov-target-editor">
              <div className="income-type-toggle">
                <button className={`income-type-btn ${invTargetTypeInput === 'percent' ? 'active' : ''}`} onClick={() => setInvTargetTypeInput('percent')}>% of income</button>
                <button className={`income-type-btn ${invTargetTypeInput === 'amount'  ? 'active' : ''}`} onClick={() => setInvTargetTypeInput('amount')}>Flat amount</button>
              </div>
              <div className="sov-target-input-wrap">
                {invTargetTypeInput === 'amount' && <span className="income-prefix">$</span>}
                <input className="income-input" type="number" min="0" value={invTargetValueInput}
                  onChange={e => setInvTargetValueInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveInvTarget() }}
                  placeholder={invTargetTypeInput === 'percent' ? '20' : '24000'} style={{ width: 100 }} autoFocus />
                {invTargetTypeInput === 'percent' && <span className="income-suffix">%</span>}
              </div>
              <button className="btn-primary" onClick={handleSaveInvTarget} disabled={savingInvTarget}>
                {savingInvTarget ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}

          <div className="sov-body">
            <div className="sov-left">
              <div className="sov-stats-grid">
                <div className="sov-stat">
                  <span className="sov-stat-label">Monthly</span>
                  <span className="sov-stat-value">{fmt(totalMonthlySavings)}</span>
                </div>
                <div className="sov-stat">
                  <span className="sov-stat-label">Annual projection</span>
                  <span className="sov-stat-value">{fmt(annualSavings)}</span>
                </div>
                <div className="sov-stat">
                  <span className="sov-stat-label">Annual target</span>
                  <span className="sov-stat-value">{annualInvTarget > 0 ? fmt(annualInvTarget) : '—'}</span>
                </div>
                <div className="sov-stat">
                  <span className="sov-stat-label">Savings rate</span>
                  <span className="sov-stat-value">{savingsRate.toFixed(1)}%</span>
                </div>
              </div>

              {annualInvTarget > 0 && (
                <div className="sov-progress-section">
                  <div className="sov-progress-header">
                    <div className={`sov-status ${activeOnTrack ? 'sov-on-track' : 'sov-off-track'}`}>
                      <span className="sov-status-dot" />
                      {activeOnTrack ? 'On track' : 'Behind target'}
                    </div>
                    <div className="sov-progress-toggle">
                      <button className={progressView === 'cy'  ? 'active' : ''} onClick={() => setProgressView('cy')}>Full year</button>
                      <button className={progressView === 'ytd' ? 'active' : ''} onClick={() => setProgressView('ytd')}>YTD</button>
                    </div>
                  </div>
                  <div className="sov-bar-wrap">
                    <div className="sov-bar-fill" style={{ width: `${activeProgress * 100}%`, background: activeOnTrack ? '#4ade80' : '#fbbf24' }} />
                  </div>
                  <div className="sov-bar-labels">
                    <span>{progressView === 'cy' ? `${fmt(annualSavings)} projected` : `${fmt(ytdSaved)} invested YTD`}</span>
                    <span>{progressView === 'cy' ? `${fmt(annualInvTarget)} target` : `${fmt(ytdTarget)} target by now`}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="sov-sources">
              {investments.filter(a => a.type === '401k').map(a => (
                <div key={a.id} className="sov-source-row">
                  <span className="sov-dot sov-dot-blue" />
                  <span className="sov-source-name">{a.name}</span>
                  <span className="sov-source-amount">{fmt(calc401k(a, monthlyGross).yours)}/mo</span>
                </div>
              ))}
              {investments.filter(a => a.type !== '401k').map(a => (
                <div key={a.id} className="sov-source-row">
                  <span className="sov-dot sov-dot-purple" />
                  <span className="sov-source-name">{a.name}</span>
                  <span className="sov-source-amount">{fmt(a.monthly_contribution)}/mo</span>
                </div>
              ))}
              {totalEmployerMatch > 0 && (
                <div className="sov-source-row sov-employer">
                  <span className="sov-dot sov-dot-gray" />
                  <span className="sov-source-name">Employer match</span>
                  <span className="sov-source-amount sov-match">+{fmt(totalEmployerMatch)}/mo</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Budget items table ── */}
      {!loading && (
        <div className="budget-table-section">
          <div className="budget-table-header"><h2>Monthly Expenses</h2></div>
          <div className="budget-table-card">
            <div className="bt-row bt-head">
              <span className="bt-col-name">Item</span>
              <span className="bt-col-type">Type</span>
              <span className="bt-col-freq">Frequency</span>
              <span className="bt-col-amount">Amount</span>
              <span className="bt-col-action" />
            </div>

            {items.length === 0 && <div className="bt-empty">No items yet — add one below.</div>}

            {items.map(item => (
              <div key={item.id} className="bt-row bt-data-row">
                <span className="bt-col-name">{item.name}</span>
                <span className="bt-col-type"><span className={`type-badge type-${item.type}`}>{TYPE_LABELS[item.type]}</span></span>
                <span className="bt-col-freq bt-freq-label">{item.frequency === 'recurring' ? 'Monthly' : 'One-off'}</span>
                <span className="bt-col-amount bt-amount">{fmt(item.amount)}</span>
                <span className="bt-col-action">
                  {deletingId === item.id ? (
                    <div className="bt-confirm-delete">
                      <button className="btn-danger btn-sm" onClick={() => handleDeleteItem(item.id)} disabled={deleting}>{deleting ? '...' : 'Delete'}</button>
                      <button className="btn-secondary btn-sm" onClick={() => setDeletingId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button className="bt-delete-btn" onClick={() => setDeletingId(item.id)}>✕</button>
                  )}
                </span>
              </div>
            ))}

            {recurringItems.length > 0 && oneOffItems.length > 0 && (
              <div className="bt-row bt-subtotal">
                <span className="bt-col-name">Monthly recurring</span>
                <span className="bt-col-type" /><span className="bt-col-freq" />
                <span className="bt-col-amount">{fmt(totalRecurring)}</span>
                <span className="bt-col-action" />
              </div>
            )}

            <div className="bt-row bt-add-row">
              <input ref={nameInputRef} className="bt-input bt-col-name" placeholder="Add item..."
                value={newRow.name} onChange={e => setNewRow(r => ({ ...r, name: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter') handleAddRow() }} />
              <span className="bt-col-type">
                <select className="bt-select" value={newRow.type} onChange={e => setNewRow(r => ({ ...r, type: e.target.value as ItemType }))}>
                  {TYPES.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
                </select>
              </span>
              <span className="bt-col-freq">
                <select className="bt-select" value={newRow.frequency} onChange={e => setNewRow(r => ({ ...r, frequency: e.target.value as Frequency }))}>
                  <option value="recurring">Monthly</option>
                  <option value="one_off">One-off</option>
                </select>
              </span>
              <span className="bt-col-amount">
                <div className="bt-amount-wrap">
                  <span className="bt-amount-prefix">$</span>
                  <input className="bt-input bt-amount-input" placeholder="0" type="number"
                    value={newRow.amount} onChange={e => setNewRow(r => ({ ...r, amount: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddRow() }} />
                </div>
              </span>
              <span className="bt-col-action">
                <button className="bt-add-btn" onClick={handleAddRow} disabled={adding || !newRow.name.trim() || !newRow.amount}>
                  {adding ? '...' : '+ Add'}
                </button>
              </span>
            </div>

            {items.length > 0 && (
              <div className="bt-row bt-total">
                <span className="bt-col-name">Total allocated</span>
                <span className="bt-col-type" /><span className="bt-col-freq" />
                <span className="bt-col-amount">{fmt(totalItems)}</span>
                <span className="bt-col-action" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Investments & Retirement table ── */}
      {!loading && (
        <div className="budget-table-section" style={{ marginTop: '2rem' }}>
          <div className="budget-table-header">
            <h2>Investments & Retirement</h2>
            <button className="btn-primary" onClick={() => setShowInvForm(v => !v)}>
              {showInvForm ? 'Cancel' : '+ Add Account'}
            </button>
          </div>

          {showInvForm && (
            <div className="inv-form">
              <div className="inv-form-row">
                <div className="inv-field">
                  <label>Account type</label>
                  <div className="income-type-toggle">
                    {(['401k', 'ira', 'other'] as InvestmentType[]).map(t => (
                      <button key={t} className={`income-type-btn ${newInv.type === t ? 'active' : ''}`}
                        onClick={() => setNewInv(f => ({ ...f, type: t }))}>
                        {t === '401k' ? '401(k)' : t === 'ira' ? 'IRA' : 'Other'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="inv-field inv-field--grow">
                  <label>Account name</label>
                  <input className="bt-input"
                    placeholder={newInv.type === '401k' ? 'e.g. Fidelity 401(k)' : newInv.type === 'ira' ? 'e.g. Roth IRA' : 'e.g. Brokerage'}
                    value={newInv.name} onChange={e => setNewInv(f => ({ ...f, name: e.target.value }))} />
                </div>
              </div>

              {newInv.type === '401k' && (
                <div className="inv-form-row">
                  <div className="inv-field">
                    <label>Your contribution</label>
                    <div className="inv-pct-wrap">
                      <input className="bt-input inv-pct-input" type="number" placeholder="6" min="0" max="100"
                        value={newInv.contribution_pct} onChange={e => setNewInv(f => ({ ...f, contribution_pct: e.target.value }))} />
                      <span className="inv-pct-suffix">% of salary</span>
                    </div>
                  </div>
                  <div className="inv-field">
                    <label>Employer match rate</label>
                    <div className="inv-pct-wrap">
                      <input className="bt-input inv-pct-input" type="number" placeholder="100" min="0" max="200"
                        value={newInv.employer_match_pct} onChange={e => setNewInv(f => ({ ...f, employer_match_pct: e.target.value }))} />
                      <span className="inv-pct-suffix">% per $ you contribute</span>
                    </div>
                  </div>
                  <div className="inv-field">
                    <label>Match cap</label>
                    <div className="inv-pct-wrap">
                      <input className="bt-input inv-pct-input" type="number" placeholder="3" min="0" max="100"
                        value={newInv.employer_match_cap} onChange={e => setNewInv(f => ({ ...f, employer_match_cap: e.target.value }))} />
                      <span className="inv-pct-suffix">% of salary</span>
                    </div>
                  </div>
                </div>
              )}

              {newInv.type === 'ira' && (
                <div className="inv-form-row">
                  <div className="inv-field">
                    <label>IRA type</label>
                    <div className="income-type-toggle">
                      <button className={`income-type-btn ${newInv.ira_type === 'roth' ? 'active' : ''}`} onClick={() => setNewInv(f => ({ ...f, ira_type: 'roth' }))}>Roth</button>
                      <button className={`income-type-btn ${newInv.ira_type === 'traditional' ? 'active' : ''}`} onClick={() => setNewInv(f => ({ ...f, ira_type: 'traditional' }))}>Traditional</button>
                    </div>
                  </div>
                  <div className="inv-field">
                    <label>Monthly contribution</label>
                    <div className="bt-amount-wrap">
                      <span className="bt-amount-prefix">$</span>
                      <input className="bt-input bt-amount-input" type="number" placeholder="583"
                        value={newInv.monthly_contribution} onChange={e => setNewInv(f => ({ ...f, monthly_contribution: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              {newInv.type === 'other' && (
                <div className="inv-form-row">
                  <div className="inv-field">
                    <label>Monthly contribution</label>
                    <div className="bt-amount-wrap">
                      <span className="bt-amount-prefix">$</span>
                      <input className="bt-input bt-amount-input" type="number" placeholder="0"
                        value={newInv.monthly_contribution} onChange={e => setNewInv(f => ({ ...f, monthly_contribution: e.target.value }))} />
                    </div>
                  </div>
                </div>
              )}

              <button className="btn-primary" onClick={handleAddInvestment} disabled={addingInv || !newInv.name.trim()}>
                {addingInv ? 'Saving...' : 'Add Account'}
              </button>
            </div>
          )}

          <div className="budget-table-card">
            <div className="inv-row inv-head">
              <span className="inv-col-name">Account</span>
              <span className="inv-col-type">Type</span>
              <span className="inv-col-yours">Your contribution</span>
              <span className="inv-col-match">Employer match</span>
              <span className="inv-col-total">Monthly total</span>
              <span className="inv-col-action" />
            </div>

            {investments.length === 0 && <div className="bt-empty">No investment accounts yet.</div>}

            {investments.map(acc => {
              const is401k = acc.type === '401k'
              const totals = is401k ? calc401k(acc, monthlyGross) : null
              const monthly = is401k ? totals!.yours : acc.monthly_contribution
              return (
                <div key={acc.id} className="inv-row inv-data-row">
                  <div className="inv-col-name">
                    <span className="inv-account-name">{acc.name}</span>
                    {acc.ira_type && <span className={`inv-ira-badge ${acc.ira_type}`}>{acc.ira_type === 'roth' ? 'Roth' : 'Traditional'}</span>}
                  </div>
                  <span className="inv-col-type">
                    <span className={`type-badge inv-type-${acc.type}`}>
                      {acc.type === '401k' ? '401(k)' : acc.type === 'ira' ? 'IRA' : 'Other'}
                    </span>
                  </span>
                  <span className="inv-col-yours">
                    {is401k
                      ? <><strong>{fmt(totals!.yours)}</strong><span className="inv-pct-note">({acc.contribution_pct}%)</span></>
                      : <strong>{fmt(monthly)}</strong>}
                  </span>
                  <span className="inv-col-match">
                    {is401k && totals!.employer > 0
                      ? <span className="inv-match-value">{fmt(totals!.employer)}</span>
                      : <span className="inv-no-match">—</span>}
                  </span>
                  <span className="inv-col-total"><strong>{fmt(is401k ? totals!.total : monthly)}</strong></span>
                  <span className="inv-col-action">
                    {deletingInvId === acc.id ? (
                      <div className="bt-confirm-delete">
                        <button className="btn-danger btn-sm" onClick={() => handleDeleteInvestment(acc.id)} disabled={deletingInv}>{deletingInv ? '...' : 'Delete'}</button>
                        <button className="btn-secondary btn-sm" onClick={() => setDeletingInvId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <button className="bt-delete-btn" onClick={() => setDeletingInvId(acc.id)}>✕</button>
                    )}
                  </span>
                </div>
              )
            })}

            {investments.length > 0 && (
              <div className="inv-row inv-total">
                <span className="inv-col-name"><b>Total monthly</b></span>
                <span className="inv-col-type" />
                <span className="inv-col-yours"><b>{fmt(totalInvested)}</b></span>
                <span className="inv-col-match inv-match-value"><b>{fmt(totalEmployerMatch)}</b></span>
                <span className="inv-col-total"><b>{fmt(totalInvested + totalEmployerMatch)}</b></span>
                <span className="inv-col-action" />
              </div>
            )}
          </div>

          {totalEmployerMatch > 0 && (
            <p className="inv-match-note">
              Your employer contributes an additional <strong>{fmt(totalEmployerMatch)}/mo</strong> ({fmt(totalEmployerMatch * 12)}/yr) in matching — not counted against your take-home.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
