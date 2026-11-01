// PreviewModal.tsx
// Shown after a CSV is parsed, before the import is committed.
// Displays a preview of the first 5 transactions for the user to verify.
// onConfirm triggers the actual Supabase insert in Upload.tsx
// onCancel closes the modal and resets the upload form
// onBack (optional) returns to the column mapping step

import TransactionTable from '../TransactionTable/TransactionTable'
import './PreviewModal.css'

interface Transaction {
    id: string
    date: string
    description: string
    amount: number
    category: string | null
}

interface Props {
    transactions: Transaction[]
    onConfirm: () => void
    onCancel: () => void
    importing: boolean
    onBack?: () => void
    skipped?: number
}

export default function PreviewModal({ transactions, onConfirm, onCancel, importing, onBack, skipped = 0 }: Props) {
    return (
        <div className="modal-overlay">
            <div className="modal modal--wide">

                <button className="modal-close" onClick={onCancel}>✕</button>

                <h2>Review your transactions</h2>
                <p className="modal-sub">
                    Showing the first 5 of {transactions.length} transactions.
                    Does this look correct?
                    {skipped > 0 && ` ${skipped} unreadable row${skipped === 1 ? '' : 's'} will be skipped.`}
                </p>

                <div className="preview-table-wrapper">
                    <TransactionTable transactions={transactions} preview />
                </div>

                <div className="modal-actions">
                    {onBack ? (
                        <button className="btn-secondary" onClick={onBack} disabled={importing}>
                            Back to mapping
                        </button>
                    ) : (
                        <button className="btn-secondary" onClick={onCancel}>
                            Cancel
                        </button>
                    )}
                    <button className="btn-primary" onClick={onConfirm} disabled={importing}>
                        {importing ? 'Importing...' : `Import all ${transactions.length}`}
                    </button>
                </div>

            </div>
        </div>
    )
}