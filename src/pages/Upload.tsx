// Upload.tsx
// Lets users import their transaction history via CSV export from their bank.
// Most banks (Chase, BoA, Wells Fargo, etc.) let you export a CSV from
// their website under account activity or statements.

import React, { useState } from 'react'
import Papa from 'papaparse'
import { useAuth } from '@clerk/react'
import { makeSupabaseClient } from '../lib/supabase'
import SuccessModal from '../components/SuccessModal'
import PreviewModal from '../components/PreviewModal'






export default function Upload() {
  const [rows, setRows] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const { getToken, userId } = useAuth()
  const [showSuccess, setShowSuccess] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [showPreview, setShowPreview] = useState(false)
  const [formatted, setFormatted] = useState<any[]>([])


  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const raw = results.data as any[]
        setRows(raw)
        setFormatted(formatRows(raw))
        setShowPreview(true)
      }
    })
  }

  async function handleImport() {
    setImporting(true)
    const token = await getToken({ template: 'supabase' })
    const supabase = makeSupabaseClient(() => Promise.resolve(token))

    const { error } = await supabase.from('transactions').insert(formatted)

    if (error) {
      if (error.code === '23505') {
        // 23505 is Postgres's unique violation error code
        console.error('Some transactions already exist and were skipped')
      } else {
        console.error('Import failed:', error)
      }
    }
    else {
      setImportedCount(formatted.length)
      setShowSuccess(true)
      setShowPreview(false)
      setRows([])
      setFormatted([])
    }

    setImporting(false)
  }

  function formatRows(rows: any[]) {
    return rows.map(row => ({
      id: crypto.randomUUID(),
      user_id: userId,
      date: row['Post Date'],
      description: row['Description'],
      category: null,
      amount: row['Credit']
        ? parseFloat(row['Credit'])
        : parseFloat(row['Debit']) * -1,
    }))
  }

  function handleUploadAnother() {
    setShowSuccess(false)
    setImportedCount(0)
  }

  function handleCancel() {
    setShowPreview(false)
    setRows([])
    setFormatted([])
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
      {showPreview && (
        <PreviewModal
          transactions={formatted}
          onConfirm={handleImport}
          onCancel={handleCancel}
          importing={importing}
        />
      )}

      {/*
        TODO: On confirm, parse the CSV rows and insert them into Supabase.
        Use makeSupabaseClient() with the Clerk token, then:
          supabase.from('transactions').insert([...rows])
        Supabase will attach the user ID automatically via RLS.
      */}

      {showSuccess && (
      <SuccessModal
        rowCount={importedCount}
        onUploadAnother={handleUploadAnother}
      />
      )
    }
    </div>
  )
}
