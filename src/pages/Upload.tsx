// Upload.tsx
// Lets users import their transaction history via CSV export from their bank.
// Most banks (Chase, BoA, Wells Fargo, etc.) let you export a CSV from
// their website under account activity or statements.

import React, { useState, useRef } from 'react'
import './Upload.css'

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
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragging, setDragging] = useState(false)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()  // required to allow dropping
    setDragging(true)
  }

  function handleDragLeave() {
    setDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()  // stops browser from opening the file
    setDragging(false)

    const file = e.dataTransfer.files?.[0]
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

    const { error } = await supabase.from('transactions').upsert(formatted, {
      onConflict: 'user_id, date, description, amount',
      ignoreDuplicates: true
    })
    
    if (error) {
      console.error('Import failed:', error)
    } else {
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
    fileInputRef.current?.click()
  }

  function handleCancel() {
    setShowPreview(false)
    setRows([])
    setFormatted([])
  }

  return (
    <div className="page">
      <div className="upload-header">
        <h1>Upload Statements</h1>
        <p>Import your bank transactions via CSV export.</p>
      </div>

      {/* Hidden native file input — triggered by clicking the zone or browse button */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      <div
        className={`upload-zone ${dragging ? 'upload-zone--dragging' : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="upload-icon">📂</span>
        <h2>Drag and drop your CSV here</h2>
        <p>Supports exports from most major banks</p>
        <button
          className="upload-browse"
          onClick={e => {
            e.stopPropagation() // prevents double-triggering the zone click
            fileInputRef.current?.click()
          }}
        >
          Browse files
        </button>
      </div>

      {showPreview && (
        <PreviewModal
          transactions={formatted}
          onConfirm={handleImport}
          onCancel={handleCancel}
          importing={importing}
        />
      )}

      {showSuccess && (
        <SuccessModal
          rowCount={importedCount}
          onUploadAnother={handleUploadAnother}
        />
      )}
    </div>
  )
}
