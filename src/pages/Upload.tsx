// Upload.tsx
// Lets users import their transaction history via CSV export from their bank.
// Most banks (Chase, BoA, Wells Fargo, etc.) let you export a CSV from
// their website under account activity or statements.

export default function Upload() {
  return (
    <div className="page">
      <h1>Upload</h1>

      {/*
        TODO: Add a drag-and-drop file input here.
        Accept only .csv files. You can use the native <input type="file">
        or a library like react-dropzone for a better UX.
      */}

      {/*
        TODO: Add a CSV preview / column mapping step here.
        Different banks format their CSVs differently — column names like
        "Transaction Date" vs "Date", "Amount" vs "Debit".
        You'll want to show the user the first few rows and let them confirm
        which column maps to date, description, and amount before importing.
      */}

      {/*
        TODO: On confirm, parse the CSV rows and insert them into Supabase.
        Use makeSupabaseClient() with the Clerk token, then:
          supabase.from('transactions').insert([...rows])
        Supabase will attach the user ID automatically via RLS.
      */}
    </div>
  )
}
