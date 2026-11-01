// Upload.tsx
// Lets users import their transaction history via CSV or Excel export from their bank.
// Flow: parse file -> map columns to our fields -> preview -> import.
// On import, creates a csv_imports record first, then attaches import_id
// to every transaction row so imports can be tracked and bulk-deleted later.
// Past imports are listed below the upload zone, where they can be renamed or removed.

import React, { useState, useRef } from 'react'
import './Upload.css'

import { useAuth } from '@clerk/react'
import { getSupabaseClient } from '../lib/supabase'
import {
  ACCEPTED_EXTENSIONS, isAcceptedFile, parseFile as parseStatement,
  guessMapping, loadSavedMapping, saveMapping, applyMapping,
} from '../lib/fileImport'
import type { ColumnMapping, MappedTransaction, ParsedFile } from '../lib/fileImport'
import SuccessModal from '../components/SuccessModal/SuccessModal'
import PreviewModal from '../components/PreviewModal/PreviewModal'
import ColumnMapper from '../components/ColumnMapper/ColumnMapper'
import ImportHistory from '../components/ImportHistory/ImportHistory'

export default function Upload() {
  const [parsed, setParsed]       = useState<ParsedFile | null>(null)
  const [mapping, setMapping]     = useState<ColumnMapping | null>(null)
  const [skipped, setSkipped]     = useState(0)
  const [error, setError]         = useState('')
  const [importing, setImporting] = useState(false)
  const [showSuccess, setShowSuccess]   = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [showPreview, setShowPreview]   = useState(false)
  const [formatted, setFormatted] = useState<MappedTransaction[]>([])
  const [fileName, setFileName]   = useState('')
  const [dragging, setDragging]   = useState(false)
  const [historyKey, setHistoryKey] = useState(0)

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
  async function parseFile(file: File) {
    setError('')

    if (!isAcceptedFile(file)) {
      setError(`Unsupported file type. Please upload a ${ACCEPTED_EXTENSIONS.join(', ')} file.`)
      setFileName('')
      return
    }

    try {
      const result = await parseStatement(file)
      if (result.headers.length === 0 || result.rows.length === 0) {
        setError('We couldn\'t find any rows in that file.')
        setFileName('')
        return
      }

      setParsed(result)
      // Reuse the mapping from the last time this layout was uploaded, if any,
      // falling back to guesses for any fields it doesn't cover
      setMapping({
        ...guessMapping(result.headers, result.rows),
        ...loadSavedMapping(result.headers),
      })
    } catch (err) {
      console.error('Failed to parse file:', err)
      setError('We couldn\'t read that file. Make sure it\'s a valid CSV or Excel export.')
      setFileName('')
    }
  }

  function handleMappingConfirm(confirmed: ColumnMapping) {
    if (!parsed) return
    const { transactions, skipped } = applyMapping(parsed.rows, confirmed, userId)
    saveMapping(parsed.headers, confirmed)
    setMapping(confirmed)
    setFormatted(transactions)
    setSkipped(skipped)
    setShowPreview(true)
  }

  // Back from preview keeps the parsed file and mapping so users can adjust it
  function handleBackToMapping() {
    setShowPreview(false)
    setFormatted([])
  }

  function resetUpload() {
    setShowPreview(false)
    setParsed(null)
    setMapping(null)
    setFormatted([])
    setSkipped(0)
    setFileName('')
    // Clear the input so selecting the same file again still fires onChange
    if (fileInputRef.current) fileInputRef.current.value = ''
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
      setHistoryKey(k => k + 1)
      resetUpload()
    }

    setImporting(false)
  }

  function handleUploadAnother() {
    setShowSuccess(false)
    setImportedCount(0)
    fileInputRef.current?.click()
  }

  function handleCancel() {
    resetUpload()
  }

  return (
    <div className="page">
      <div className="upload-header">
        <h1>Upload Statements</h1>
        <p>Import your bank transactions via CSV or Excel export.</p>
      </div>

      {/* Hidden native file input — triggered by clicking the zone or browse button */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS.join(',')}
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
        <h2>Drag and drop your CSV or Excel file here</h2>
        <p>Supports .csv, .xlsx and .xls exports from most major banks</p>
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

      {error && <p className="upload-error">{error}</p>}

      <ImportHistory refreshKey={historyKey} />

      {parsed && mapping && !showPreview && (
        <ColumnMapper
          fileName={fileName}
          headers={parsed.headers}
          rows={parsed.rows}
          initialMapping={mapping}
          onConfirm={handleMappingConfirm}
          onCancel={handleCancel}
        />
      )}

      {showPreview && (
        <PreviewModal
          transactions={formatted}
          onConfirm={handleImport}
          onCancel={handleCancel}
          onBack={handleBackToMapping}
          skipped={skipped}
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
