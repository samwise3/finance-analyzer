// Transactions.tsx
// Displays all of the user's imported transactions in a searchable,
// filterable table. Data comes from your Supabase `transactions` table.
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { makeSupabaseClient } from '../lib/supabase'
import TransactionTable from '../components/TransactionTable'


export default function Transactions() {
  const { getToken, userId } = useAuth()
  const [transactions, setTransactions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

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

  useEffect(() => {
    fetchTransactions()
  }, [])


  return (
    <div className="page">
      <div className="transactions-header">
        <h1>Transactions</h1>
        <p>View and manage your previously imported transactions.</p>
      </div>

      {/*
        TODO: Add a search bar and filter controls here.
        Useful filters: date range, category, amount range.
        These can be local state that filters the fetched data client-side,
        or passed as query params to Supabase for server-side filtering.
      */}

      {/*
        TODO: Add the transactions table here.
        Columns to consider: date, description, category, amount.

        Each row will be a transaction fetched from Supabase.
        Remember: RLS policies will automatically ensure users only
        see their own transactions — you don't need to filter by user ID
        manually in your query.
      */}
      {!loading && transactions.length > 0 && (
        <TransactionTable transactions={transactions} />
      )}
    </div>
  )
}
