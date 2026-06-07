// Dashboard.tsx
// This is the first screen a user sees after logging in.
// It will eventually show summary cards (total spending, top categories,
// recent transactions) pulled from Supabase.

export default function Dashboard() {
  return (
    <div className="page">
      <h1>Dashboard</h1>

      {/*
        TODO: Add summary stat cards here.
        Each card will display a key metric — e.g. total spent this month,
        largest expense category, number of transactions.

        You'll fetch this data from Supabase using makeSupabaseClient()
        and the useAuth() hook from Clerk to get the session token.
      */}

      {/*
        TODO: Add a recent transactions preview here.
        A short list (5-10 rows) linking to the full Transactions page.
      */}
    </div>
  )
}
