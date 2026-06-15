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
    account?: string
}

interface Props {
    transactions: Transaction[]
    preview?: boolean
}

export default function TransactionTable({ transactions, preview }: Props) {
    const rows = preview ? transactions.slice(0, 5) : transactions

    // Show Account column only if at least one row has an account label
    const showAccount = rows.some(t => t.account)

    return (
        <table className="transactions-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Description</th>
                    {showAccount && <th>Account</th>}
                    <th>Category</th>
                    <th>Amount</th>
                </tr>
            </thead>
            <tbody>
                {rows.map(t => (
                    <tr key={t.id}>
                        <td>{new Date(t.date).toLocaleDateString()}</td>
                        <td>{t.description}</td>
                        {showAccount && <td className="account-label">{t.account ?? '—'}</td>}
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