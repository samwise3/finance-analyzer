// TransactionFilters.tsx
// Controls for filtering transactions by type and date range.
// All values are owned by Transactions.tsx and passed down as props.
import './TransactionFilters.css'

export type FilterType = 'all' | 'income' | 'expenses'

interface Props {
    type: FilterType
    onTypeChange: (type: FilterType) => void
    dateFrom: string
    dateTo: string
    onDateFromChange: (value: string) => void
    onDateToChange: (value: string) => void
    onReset: () => void
}

export default function TransactionFilters({
    type,
    onTypeChange,
    dateFrom,
    dateTo,
    onDateFromChange,
    onDateToChange,
    onReset
}: Props) {
    return (
        <div className="filters">

            {/* Type toggle */}
            <div className="filter-group">
                {(['all', 'income', 'expenses'] as FilterType[]).map(t => (
                    <button
                        key={t}
                        className={`filter-btn ${type === t ? 'filter-btn--active' : ''}`}
                        onClick={() => onTypeChange(t)}
                    >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                ))}
            </div>

            {/* Date range */}
            <div className="filter-dates">
                <input
                    type="date"
                    value={dateFrom}
                    onChange={e => onDateFromChange(e.target.value)}
                />
                <span>to</span>
                <input
                    type="date"
                    value={dateTo}
                    onChange={e => onDateToChange(e.target.value)}
                />
            </div>

            {/* Reset all filters */}
            <button className="filter-reset" onClick={onReset}>
                Reset
            </button>

        </div>
    )
}