// Upload.tsx
// Lets users import their transaction history via CSV export from their bank.
// On import, creates a csv_imports record first, then attaches import_id
// to every transaction row so imports can be tracked and bulk-deleted later.

import React, { useState, useRef } from 'react'
import './Upload.css'

import Papa from 'papaparse'
import { useAuth } from '@clerk/react'
import { getSupabaseClient } from '../lib/supabase'
import SuccessModal from '../components/SuccessModal'
import PreviewModal from '../components/PreviewModal'

export default function Upload() {
  const [rows, setRows]           = useState<any[]>([])
  const [headers, setHeaders]     = useState<string[]>([])
  const [importing, setImporting] = useState(false)
  const [showSuccess, setShowSuccess]   = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [showPreview, setShowPreview]   = useState(false)
  const [formatted, setFormatted] = useState<any[]>([])
  const [fileName, setFileName]   = useState('')
  const [dragging, setDragging]   = useState(false)

  const { getToken, userId } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragging(true)
  }

  function handleDragLeave() {
    setDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (!file) return

    setFileName(file.name)
    parseFile(file)
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setFileName(file.name)
    parseFile(file)
  }

  // Extracted into its own function since both handleFile and handleDrop need it
  function parseFile(file: File) {
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

  async function handleImport() {
    setImporting(true)
    const supabase = await getSupabaseClient(getToken)

    // Step 1 — create a csv_imports record to track this upload
    const { data: importRecord, error: importError } = await supabase
      .from('csv_imports')
      .insert({
        user_id: userId,
        file_name: fileName,
        row_count: formatted.length,
      })
      .select('id')
      .single()

    if (importError) {
      console.error('Failed to create import record:', importError)
      setImporting(false)
      return
    }

    // Step 2 — attach import_id to every transaction row so it can be
    // bulk deleted later when the user removes this import
    const withImportId = formatted.map(t => ({
      ...t,
      import_id: importRecord.id,
    }))

    // Step 3 — upsert transactions, skipping duplicates
    const { error } = await supabase.from('transactions').upsert(withImportId, {
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
      setFileName('')
    }

    setImporting(false)
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
    setFileName('')
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
            e.stopPropagation()
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
