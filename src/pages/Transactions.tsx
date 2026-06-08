// Transactions.tsx
// Fetches all transactions from Supabase, then filters and paginates
// them client-side based on search, type, and date range state.

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { makeSupabaseClient } from '../lib/supabase'
import TransactionTable from '../components/TransactionTable'
import SearchBar from '../components/SearchBar'
import TransactionFilters, { FilterType } from '../components/TransactionFilters'
import './Transactions.css'

const PAGE_SIZE = 25

export default function Transactions() {
  const { getToken } = useAuth()

  // Raw data from Supabase
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Filter state
  const [search, setSearch] = useState('')
  const [type, setType] = useState<FilterType>('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    fetchTransactions()
  }, [])

  // Reset to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [search, type, dateFrom, dateTo])

  async function fetchTransactions() {
    const token = await getToken({ template: 'supabase' })
    const supabase = makeSupabaseClient(() => Promise.resolve(token))

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })

    if (error) console.error('Fetch failed:', error)
    else setTransactions(data)

    setLoading(false)
  }

  function handleReset() {
    setSearch('')
    setType('all')
    setDateFrom('')
    setDateTo('')
  }

  // Derive filtered transactions from raw data
  const filtered = transactions.filter(t => {
    // Search filter — case insensitive description match
    if (search && !t.description.toLowerCase().includes(search.toLowerCase()))
      return false

    // Type filter
    if (type === 'income' && t.amount <= 0) return false
    if (type === 'expenses' && t.amount >= 0) return false

    // Date range filter
    if (dateFrom && t.date < dateFrom) return false
    if (dateTo && t.date > dateTo) return false

    return true
  })

  // Pagination — slice the filtered array for the current page
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  )

  return (
    <div className="page">
      <h1>Transactions</h1>

      <div className="transactions-toolbar">
        <SearchBar value={search} onChange={setSearch} />
        <TransactionFilters
          type={type}
          onTypeChange={setType}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          onReset={handleReset}
        />
      </div>

      {loading && <p className="transactions-status">Loading...</p>}

      {!loading && filtered.length === 0 && (
        <p className="transactions-status">No transactions match your filters.</p>
      )}

      {!loading && filtered.length > 0 && (
        <>
          <TransactionTable transactions={paginated} />

          {/* Pagination controls — only show if more than one page */}
          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage === 1}
              >
                ← Prev
              </button>

              <span>{currentPage} of {totalPages}</span>

              <button
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage === totalPages}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}