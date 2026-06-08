// StatCard.tsx
// Displays a single summary metric.
// color prop optionally overrides the value text color —
// useful for net (green if positive, red if negative)

interface Props {
    title: string
    value: string
    color?: string
}

export default function StatCard({ title, value, color }: Props) {
    return (
        <div className="stat-card">
            <span className="stat-title">{title}</span>
            <span className="stat-value" style={{ color: color ?? '#ffffff' }}>
                {value}
            </span>
        </div>
    )
}