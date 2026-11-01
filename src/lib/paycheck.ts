// paycheck.ts
// Shared income math for the Budget, Budget vs Actual, and Dashboard pages.
// Paycheck deductions (health insurance, HSA, 401(k), etc.) come out before
// pay is deposited, so they're shown alongside income but never subtracted
// from the paychecks that actually land in the user's account.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PaycheckDeduction {
  id: string
  name: string
  monthly_amount: number
}

// One line in a deductions list — either entered by the user, or derived
// from a 401(k) on the Budget page
export interface DeductionLine {
  key: string
  name: string
  amount: number
  source: 'manual' | '401k'
}

interface IncomeSettings {
  annual_income?: number | null
  income_type?: string | null
  tax_rate?: number | null
}

interface RetirementAccount {
  id: string
  name: string
  type: string
  contribution_pct?: number | null
}

export function monthlyIncome(settings: IncomeSettings | null | undefined) {
  const gross = (settings?.annual_income ?? 0) / 12
  const tax   = settings?.income_type === 'pre_tax' ? gross * ((settings.tax_rate ?? 25) / 100) : 0
  return { gross, tax, net: gross - tax }
}

export function deductionLines(
  manual: PaycheckDeduction[],
  investments: RetirementAccount[],
  monthlyGross: number,
): DeductionLine[] {
  const retirement = investments
    .filter(a => a.type === '401k' && (a.contribution_pct ?? 0) > 0)
    .map(a => ({
      key: `401k:${a.id}`,
      name: a.name,
      amount: monthlyGross * ((a.contribution_pct ?? 0) / 100),
      source: '401k' as const,
    }))

  const entered = manual.map(d => ({
    key: d.id,
    name: d.name,
    amount: Number(d.monthly_amount) || 0,
    source: 'manual' as const,
  }))

  return [...retirement, ...entered]
}

// Loads everything needed to show paycheck deductions. If the
// paycheck_deductions table hasn't been created yet, 401(k)s still show.
export async function fetchPaycheckSummary(supabase: SupabaseClient) {
  const [settingsRes, invRes, dedRes] = await Promise.all([
    supabase.from('budget_settings').select('annual_income, income_type, tax_rate').maybeSingle(),
    supabase.from('investment_accounts').select('id, name, type, contribution_pct'),
    supabase.from('paycheck_deductions').select('id, name, monthly_amount').order('created_at', { ascending: true }),
  ])
  if (dedRes.error) console.error('Failed to load paycheck deductions:', dedRes.error)

  const income = monthlyIncome(settingsRes.data)
  const lines  = deductionLines(dedRes.data ?? [], invRes.data ?? [], income.gross)
  const totalDeductions = lines.reduce((s, l) => s + l.amount, 0)

  return {
    income,
    lines,
    totalDeductions,
    // What should actually land in the bank each month
    expectedDeposits: Math.max(income.net - totalDeductions, 0),
  }
}
