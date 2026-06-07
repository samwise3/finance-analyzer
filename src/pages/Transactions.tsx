// Transactions.tsx
// Displays all of the user's imported transactions in a searchable,
// filterable table. Data comes from your Supabase `transactions` table.

export default function Transactions() {
  return (
    <div className="page">
      <h1>Transactions</h1>

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
    </div>
  )
}
