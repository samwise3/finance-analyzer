// TransactionTable.tsx
// A reusable table for displaying transactions.
// Accepts a transactions array as a prop — it does not fetch anything itself.
// Used on the Transactions page and eventually the Dashboard preview.
import './TransactionTable.css'


interface Transaction {
    id: string
    date: string
    description: string
    amount: number
    category: string | null
}

interface Props {
    transactions: Transaction[]
}

export default function TransactionTable({ transactions }: Props) {
    return (
        <table className="transactions-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th>Category</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                {transactions.map(t => (
                    <tr key={t.id}>
                        <td>{new Date(t.date).toLocaleDateString()}</td>
                        <td>{t.description}</td>
                        <td>{t.category ?? '—'}</td>
                        <td className={t.amount < 0 ? 'amount-debit' : 'amount-credit'}>
                            {t.amount < 0
                                ? `-$${Math.abs(t.amount).toFixed(2)}`
                                : `+$${t.amount.toFixed(2)}`}
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    )
}