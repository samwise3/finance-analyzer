// SuccessModal.tsx
// Shown after a successful CSV import.
// Accepts two callbacks as props:
//   onUploadAnother — clears the modal and resets the upload form
//   onGoToTransactions — navigates to the transactions page

import { useNavigate } from 'react-router-dom'
import './SuccessModal.css'

interface Props {
    rowCount: number
    onUploadAnother: () => void
}

export default function SuccessModal({ rowCount, onUploadAnother }: Props) {
    const navigate = useNavigate()

    return (
        <div className="modal-overlay">
            <div className="modal">

                <button className="modal-close" onClick={onUploadAnother}>✕</button>

                <div className="modal-icon">✓</div>
                <h2>Import successful</h2>
                <p>{rowCount} transactions uploaded successfully.</p>

                <div className="modal-actions">
                    <button className="btn-secondary" onClick={onUploadAnother}>
                        Upload another
                    </button>
                    <button className="btn-primary" onClick={() => navigate('/transactions')}>
                        Go to transactions
                    </button>
                </div>

            </div>
        </div>
    )
}