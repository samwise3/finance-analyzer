import '/StatsCard.css';

export default function StatsCard({ title, value }: { title: string, value: string }) {
  return (
    <div className="stats-card">
      <h3 className="stats-title">{title}</h3>
      <p className="stats-value">{value}</p>
    </div>
  )
}