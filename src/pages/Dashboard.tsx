// Dashboard.tsx
// Fetches transactions for the selected month and derives summary stats.
// selectedMonth drives both the MonthPicker display and the Supabase query.

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { Link } from 'react-router-dom'
import { makeSupabaseClient } from '../lib/supabase'
import StatCard from '../components/StatCard'
import MonthPicker from '../components/MonthPicker'
import TransactionTable from '../components/TransactionTable'
import './Dashboard.css'

interface SelectedMonth {
  year: number
  month: number  // 0-indexed
}

export default function Dashboard() {
  const { getToken } = useAuth()
  const now = new Date()

  const [selectedMonth, setSelectedMonth] = useState<SelectedMonth>({
    year: now.getFullYear(),
    month: now.getMonth()
  })
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch transactions whenever selectedMonth changes
  useEffect(() => {
    fetchTransactions()
  }, [selectedMonth])

  async function fetchTransactions() {
    setLoading(true)
    const token = await getToken({ template: 'supabase' })
    const supabase = makeSupabaseClient(() => Promise.resolve(token))

    // Build the first and last day of the selected month for the query
    const from = new Date(selectedMonth.year, selectedMonth.month, 1)
      .toISOString().split('T')[0]
    const to = new Date(selectedMonth.year, selectedMonth.month + 1, 0)
      .toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .gte('date', from)  // greater than or equal to first day
      .lte('date', to)    // less than or equal to last day
      .order('date', { ascending: false })

    if (error) console.error('Fetch failed:', error)
    else setTransactions(data)

    setLoading(false)
  }

  // Derive stats from transactions — no extra queries needed
  const spent = transactions
    .filter(t => t.amount < 0)
    .reduce((sum, t) => sum + Math.abs(t.amount), 0)

  const income = transactions
    .filter(t => t.amount > 0)
    .reduce((sum, t) => sum + t.amount, 0)

  const net = income - spent
  const count = transactions.length

  // Month navigation handlers
  function handleSelect(year: number, month: number) {
    setSelectedMonth({ year, month })
  }


  return (
    <div className="page">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <MonthPicker
          year={selectedMonth.year}
          month={selectedMonth.month}
          onSelect={handleSelect}
        />
      </div>

      {loading ? (
        <p className="dashboard-loading">Loading...</p>
      ) : (
        <>
          {/* Stat cards */}
          <div className="stat-cards">
            <StatCard
              title="Total Spent"
              value={`$${spent.toFixed(2)}`}
              color="#f87171"
            />
            <StatCard
              title="Total Income"
              value={`$${income.toFixed(2)}`}
              color="#4ade80"
            />
            <StatCard
              title="Net"
              value={`${net >= 0 ? '+' : '-'}$${Math.abs(net).toFixed(2)}`}
              color={net >= 0 ? '#4ade80' : '#f87171'}
            />
            <StatCard
              title="Transactions"
              value={`${count}`}
            />
          </div>

          {/* Recent transactions */}
          <div className="dashboard-recent">
            <div className="dashboard-recent-header">
              <h2>Recent Transactions</h2>
              <Link to="/transactions">View all →</Link>
            </div>

            {transactions.length === 0 ? (
              <p className="dashboard-empty">
                No transactions for this month.{' '}
                <Link to="/upload">Upload a CSV</Link> to get started.
              </p>
            ) : (
              <TransactionTable transactions={transactions} preview />
            )}
          </div>
        </>
      )}
    </div>
  )
}