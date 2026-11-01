// SearchBar.tsx
// Controlled text input for filtering transactions by description.
// The parent (Transactions.tsx) owns the search value in state
// and passes it down via value/onChange props.
import './SearchBar.css'

interface Props {
    value: string
    onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: Props) {
    return (
        <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
                type="text"
                placeholder="Search transactions..."
                value={value}
                onChange={e => onChange(e.target.value)}
            />
            {/* Show a clear button only when there is a search value */}
            {value && (
                <button className="search-clear" onClick={() => onChange('')}>✕</button>
            )}
        </div>
    )
}