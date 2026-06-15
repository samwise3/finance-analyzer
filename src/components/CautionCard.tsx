import './CautionCard.css'

interface CautionCardProps {
  onDismiss: () => void
}

function CautionCard({ onDismiss }: CautionCardProps) {
  return (
    <div className="caution-overlay">
      <div className="caution-card">
        <h2 className="caution-title">Caution</h2>
        <p className="caution-body">This is a demo application. Do not use real financial accounts or sensitive data.</p>
        <button className="btn-primary" onClick={onDismiss}>Got it</button>
      </div>
    </div>
  )
}

export default CautionCard
