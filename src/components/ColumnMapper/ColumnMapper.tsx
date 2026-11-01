// ColumnMapper.tsx
// Shown after a file is parsed, before the preview.
// Lets users match the columns in their file to the fields the app expects
// (date, description, amount). Columns are pre-selected using common bank
// header names, and a sample value is shown so users can confirm the match.
// onConfirm hands the final mapping back to Upload.tsx

import { useMemo, useState } from 'react'
import { applyMapping, mappingIsComplete } from '../../lib/fileImport'
import type { ColumnMapping, RawRow } from '../../lib/fileImport'
import '../PreviewModal/PreviewModal.css'
import './ColumnMapper.css'

interface Props {
    fileName: string
    headers: string[]
    rows: RawRow[]
    initialMapping: ColumnMapping
    onConfirm: (mapping: ColumnMapping) => void
    onCancel: () => void
}

type ColumnField = 'date' | 'description' | 'category' | 'amount' | 'credit' | 'debit'

export default function ColumnMapper({ fileName, headers, rows, initialMapping, onConfirm, onCancel }: Props) {
    const [mapping, setMapping] = useState<ColumnMapping>(initialMapping)

    // Re-run the conversion on every change so users see how many rows will import
    const { transactions, skipped } = useMemo(
        () => applyMapping(rows, mapping, null),
        [rows, mapping]
    )

    const complete = mappingIsComplete(mapping)

    function update<K extends keyof ColumnMapping>(key: K, value: ColumnMapping[K]) {
        setMapping(prev => ({ ...prev, [key]: value }))
    }

    // First non-empty value in the column, so users can tell what it contains
    function sampleFor(header: string) {
        if (!header) return ''
        return rows.find(r => r[header])?.[header] ?? ''
    }

    function renderSelect(field: ColumnField, label: string, required = true) {
        const value = mapping[field]
        return (
            <div className="mapper-row">
                <label className="mapper-label" htmlFor={`map-${field}`}>
                    {label}
                    {required && <span className="mapper-required">*</span>}
                </label>
                <select
                    id={`map-${field}`}
                    className="mapper-select"
                    value={value}
                    onChange={e => update(field, e.target.value)}
                >
                    <option value="">— Select column —</option>
                    {headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                    ))}
                </select>
                <span className="mapper-sample" title={sampleFor(value)}>
                    {sampleFor(value) || '—'}
                </span>
            </div>
        )
    }

    return (
        <div className="modal-overlay">
            <div className="modal modal--wide mapper-modal">

                <button className="modal-close" onClick={onCancel}>✕</button>

                <h2>Match your columns</h2>
                <p className="modal-sub">
                    Tell us which columns in <strong>{fileName}</strong> hold each field.
                    We've guessed where we could.
                </p>

                <div className="mapper-grid">
                    <div className="mapper-row mapper-row--head">
                        <span>Field</span>
                        <span>Column in your file</span>
                        <span>Sample</span>
                    </div>

                    {renderSelect('date', 'Date')}
                    {renderSelect('description', 'Description')}
                    {renderSelect('category', 'Category', false)}

                    <div className="mapper-row">
                        <span className="mapper-label">Amount format</span>
                        <div className="mapper-toggle">
                            <button
                                className={mapping.amountMode === 'single' ? 'active' : ''}
                                onClick={() => update('amountMode', 'single')}
                            >
                                One column
                            </button>
                            <button
                                className={mapping.amountMode === 'split' ? 'active' : ''}
                                onClick={() => update('amountMode', 'split')}
                            >
                                Credit / Debit
                            </button>
                        </div>
                    </div>

                    {mapping.amountMode === 'single'
                        ? renderSelect('amount', 'Amount')
                        : <>
                            {renderSelect('credit', 'Credit (money in)', false)}
                            {renderSelect('debit', 'Debit (money out)', false)}
                        </>
                    }
                </div>

                <div className="mapper-options">
                    <label className="mapper-option">
                        Date format
                        <select
                            className="mapper-select"
                            value={mapping.dateOrder}
                            onChange={e => update('dateOrder', e.target.value as ColumnMapping['dateOrder'])}
                        >
                            <option value="MDY">MM/DD/YYYY</option>
                            <option value="DMY">DD/MM/YYYY</option>
                        </select>
                    </label>

                    <label className="mapper-option mapper-option--check">
                        <input
                            type="checkbox"
                            checked={mapping.invertAmounts}
                            onChange={e => update('invertAmounts', e.target.checked)}
                        />
                        My file shows spending as positive numbers
                    </label>
                </div>

                {complete && (
                    <p className={`mapper-status ${skipped ? 'mapper-status--warn' : ''}`}>
                        {transactions.length} of {rows.length} rows ready to import
                        {skipped > 0 && ` — ${skipped} will be skipped (missing or unreadable date, description, or amount)`}
                    </p>
                )}

                <div className="modal-actions">
                    <button className="btn-secondary" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        className="btn-primary"
                        onClick={() => onConfirm(mapping)}
                        disabled={!complete || transactions.length === 0}
                    >
                        Continue
                    </button>
                </div>

            </div>
        </div>
    )
}
