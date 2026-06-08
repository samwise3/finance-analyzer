// Upload.tsx
// Lets users import their transaction history via CSV export from their bank.
// Most banks (Chase, BoA, Wells Fargo, etc.) let you export a CSV from
// their website under account activity or statements.

import React, { useState } from 'react'
import Papa from 'papaparse'

export default function Upload() {
  const [rows, setRows] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [importing, setImporting] = useState(false)


  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setHeaders(Object.keys(results.data[0] as object))
        setRows(results.data as any[])
      }
    })
  }


  return (
    <div className="page">
      <h1>Upload</h1>

      {/*
        TODO: Add a drag-and-drop file input here.
        Accept only .csv files. You can use the native <input type="file">
        or a library like react-dropzone for a better UX.
      */}
      <input type="file" accept=".csv" onChange={handleFile} />

      {/*
        TODO: Add a CSV preview / column mapping step here.
        Different banks format their CSVs differently — column names like
        "Transaction Date" vs "Date", "Amount" vs "Debit".
        You'll want to show the user the first few rows and let them confirm
        which column maps to date, description, and amount before importing.
      */}
      {rows.length > 0 && (
        <div>
          <h2>Preview</h2>
          <table>
            <thead>
              <tr>
                {headers.map(header => (
                  <th key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 5).map((row, i) => (
                <tr key={i}>
                  {headers.map(header => (
                    <td key={header}>{row[header]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/*
        TODO: On confirm, parse the CSV rows and insert them into Supabase.
        Use makeSupabaseClient() with the Clerk token, then:
          supabase.from('transactions').insert([...rows])
        Supabase will attach the user ID automatically via RLS.
      */}
    </div>
  )
}
