// Imports.tsx
// Shows all CSV imports for the current user.
// Users can rename imports for readability and delete them.
// Deleting an import cascades to all its transactions via Postgres foreign key.

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { getSupabaseClient } from '../lib/supabase'
import './Imports.css'

interface CsvImport {
  id: string
  file_name: string
  row_count: number
  created_at: string
}

export default function Imports() {
  const { getToken } = useAuth()

  const [imports, setImports]       = useState<CsvImport[]>([])
  const [loading, setLoading]       = useState(true)

  // Tracks which row is currently being renamed
  // null means no row is being edited
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  // Tracks which row is pending deletion confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleting, setDeleting]     = useState(false)

  useEffect(() => {
    fetchImports()
  }, [])

  async function fetchImports() {
    const supabase = await getSupabaseClient(getToken)

    const { data, error } = await supabase
      .from('csv_imports')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) console.error('Failed to fetch imports:', error)
    else setImports(data ?? [])

    setLoading(false)
  }

  // Start editing a row — pre-fill input with current name
  function handleStartEdit(imp: CsvImport) {
    setEditingId(imp.id)
    setEditingName(imp.file_name)
  }

  // Save the renamed file back to Supabase
  async function handleSaveEdit(id: string) {
    if (!editingName.trim()) return

    const supabase = await getSupabaseClient(getToken)

    const { error } = await supabase
      .from('csv_imports')
      .update({ file_name: editingName.trim() })
      .eq('id', id)

    if (error) console.error('Failed to rename import:', error)
    else {
      // Update local state so UI reflects change immediately without refetch
      setImports(prev =>
        prev.map(imp => imp.id === id ? { ...imp, file_name: editingName.trim() } : imp)
      )
    }

    setEditingId(null)
  }

  // Delete the import — cascade deletes all its transactions
  async function handleDelete(id: string) {
    setDeleting(true)
    const supabase = await getSupabaseClient(getToken)

    const { error } = await supabase
      .from('csv_imports')
      .delete()
      .eq('id', id)

    if (error) console.error('Failed to delete import:', error)
    else setImports(prev => prev.filter(imp => imp.id !== id))

    setDeletingId(null)
    setDeleting(false)
  }

  return (
    <div className="page">
      <h1>CSV Imports</h1>
      <p className="imports-sub">
        Manage your imported CSV files. Deleting an import removes all its transactions.
      </p>

      {loading && <p className="imports-status">Loading...</p>}

      {!loading && imports.length === 0 && (
        <p className="imports-status">No imports yet.</p>
      )}

      {!loading && imports.length > 0 && (
        <div className="imports-list">
          {imports.map(imp => (
            <div key={imp.id} className="import-item">

              <div className="import-item-info">
                {/* Inline rename — clicking the name switches to an input */}
                {editingId === imp.id ? (
                  <input
                    className="import-name-input"
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onBlur={() => handleSaveEdit(imp.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveEdit(imp.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    autoFocus
                  />
                ) : (
                  <button
                    className="import-name"
                    onClick={() => handleStartEdit(imp)}
                    title="Click to rename"
                  >
                    {imp.file_name}
                    <span className="import-edit-hint">✎</span>
                  </button>
                )}

                <div className="import-meta">
                  <span>{imp.row_count} transactions</span>
                  <span>·</span>
                  <span>{new Date(imp.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Delete button — shows confirmation inline */}
              {deletingId === imp.id ? (
                <div className="import-confirm-delete">
                  <span>Delete all {imp.row_count} transactions?</span>
                  <button
                    className="btn-danger"
                    onClick={() => handleDelete(imp.id)}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setDeletingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="import-delete-btn"
                  onClick={() => setDeletingId(imp.id)}
                >
                  Remove
                </button>
              )}

            </div>
          ))}
        </div>
      )}
    </div>
  )
}
