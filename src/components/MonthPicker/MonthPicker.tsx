// MonthPicker.tsx
// Clicking the month label opens a dropdown grid for fast month/year selection.
// useRef + useEffect handle clicking outside to close the dropdown.

import { useState, useRef, useEffect } from 'react'
import './MonthPicker.css'

interface Props {
    year: number
    month: number
    onSelect: (year: number, month: number) => void
}

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
]

const MONTHS_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
]

export default function MonthPicker({ year, month, onSelect }: Props) {
    const [open, setOpen] = useState(false)
    const [dropdownYear, setDropdownYear] = useState(year)
    const ref = useRef<HTMLDivElement>(null)

    const now = new Date()

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    function handleSelect(m: number) {
        onSelect(dropdownYear, m)
        setOpen(false)
    }

    function isFuture(m: number) {
        // Prevent selecting months in the future
        return dropdownYear > now.getFullYear() ||
            (dropdownYear === now.getFullYear() && m > now.getMonth())
    }

    return (
        <div className="month-picker" ref={ref}>
            <button className="month-picker-label" onClick={() => setOpen(o => !o)}>
                {MONTHS_FULL[month]} {year} ▾
            </button>

            {open && (
                <div className="month-dropdown">

                    {/* Year navigation */}
                    <div className="month-dropdown-year">
                        <button onClick={() => setDropdownYear(y => y - 1)}>←</button>
                        <span>{dropdownYear}</span>
                        <button
                            onClick={() => setDropdownYear(y => y + 1)}
                            disabled={dropdownYear >= now.getFullYear()}
                        >→</button>
                    </div>

                    {/* Month grid */}
                    <div className="month-grid">
                        {MONTHS.map((label, i) => (
                            <button
                                key={i}
                                className={[
                                    'month-cell',
                                    i === month && dropdownYear === year ? 'month-cell--active' : '',
                                    isFuture(i) ? 'month-cell--disabled' : ''
                                ].join(' ')}
                                onClick={() => !isFuture(i) && handleSelect(i)}
                                disabled={isFuture(i)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>

                </div>
            )}
        </div>
    )
}