// ConnectBank.tsx
// Manages all connected bank accounts for the user.
// Supports multiple accounts across different institutions.
//
// Flow for adding a new account:
//   1. Fetch a link_token from Edge Function
//   2. Open Plaid Link UI
//   3. On success, exchange public_token — get back institution_name + item_id
//   4. Show confirmation step — user can edit name and select account type
//   5. Save account type to Supabase and trigger transaction sync

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/react'
import { usePlaidLink } from 'react-plaid-link'
import { getSupabaseClient } from '../lib/supabase'
import { Link } from 'react-router-dom'
import './ConnectBank.css'

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL

// Account types the user can choose from
const ACCOUNT_TYPES = [
  { value: 'checking',    label: 'Checking / Savings' },
  { value: 'credit',      label: 'Credit Card' },
  { value: 'investment',  label: 'Investment / Retirement' },
]

interface ConnectedAccount {
  id: string
  institution_name: string
  account_type: string | null
  created_at: string
  item_id: string
}

// Shown after Plaid Link completes — lets user confirm/edit before saving
interface PendingAccount {
  item_id: string
  institution_name: string
}

export default function ConnectBank() {
  const { getToken, userId } = useAuth()

  const [linkToken, setLinkToken]       = useState<string | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)

  // List of already-connected accounts
  const [accounts, setAccounts]         = useState<ConnectedAccount[]>([])

  // Remove account state
  const [removingId, setRemovingId]     = useState<string | null>(null)
  const [removing, setRemoving]         = useState(false)

  // Confirmation step state
  const [pending, setPending]           = useState<PendingAccount | null>(null)
  const [editedName, setEditedName]     = useState('')
  const [accountType, setAccountType]   = useState('checking')
  const [saving, setSaving]             = useState(false)

  useEffect(() => {
    if (userId) {
      fetchLinkToken()
      fetchConnectedAccounts()
    }
  }, [userId])

  // Fetch existing connected accounts from Supabase
  async function fetchConnectedAccounts() {
    const supabase = await getSupabaseClient(getToken)
    const { data, error } = await supabase
      .from('plaid_items')
      .select('id, institution_name, account_type, created_at, item_id')
      .order('created_at', { ascending: false })

    if (error) console.error('Failed to fetch accounts:', error)
    else setAccounts(data ?? [])
  }

  async function fetchLinkToken() {
    try {
      const clerkToken = await getToken({ template: 'supabase' })

      const res = await fetch(`${FUNCTIONS_URL}/plaid-create-link-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${clerkToken}`,
        },
        body: JSON.stringify({ userId }),
      })

      const data = await res.json()
      if (!res.ok) { setError('Failed to initialize bank connection.'); return }
      setLinkToken(data.link_token)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Called by Plaid when user successfully connects — show confirmation step
  async function onSuccess(publicToken: string) {
    try {
      const clerkToken = await getToken({ template: 'supabase' })

      const res = await fetch(`${FUNCTIONS_URL}/plaid-exchange-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${clerkToken}`,
        },
        body: JSON.stringify({ public_token: publicToken, userId }),
      })

      const data = await res.json()
      if (!res.ok) { setError('Failed to connect bank. Please try again.'); return }

      // Show confirmation step with pre-filled institution name
      setPending({ item_id: data.item_id, institution_name: data.institution_name })
      setEditedName(data.institution_name)
      setAccountType('checking')
    } catch {
      setError('Something went wrong during connection.')
    }
  }

  // Called when user confirms the account details
  async function handleConfirm() {
    if (!pending) return
    setSaving(true)

    try {
      const supabase = await getSupabaseClient(getToken)

      // Save account type and edited name to Supabase
      const { error: updateError } = await supabase
        .from('plaid_items')
        .update({
          institution_name: editedName,
          account_type: accountType,
        })
        .eq('item_id', pending.item_id)

      if (updateError) {
        console.error('Failed to save account details:', updateError)
        setError('Failed to save account details.')
        return
      }

      // Trigger transaction sync
      const clerkToken = await getToken({ template: 'supabase' })
      const syncRes = await fetch(`${FUNCTIONS_URL}/plaid-sync-transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${clerkToken}`,
        },
        body: JSON.stringify({ userId }),
      })

      if (!syncRes.ok) console.error('Sync failed:', await syncRes.json())

      // Reset confirmation state and refresh accounts list
      setPending(null)
      await fetchConnectedAccounts()
      // Refresh link token for next connection
      await fetchLinkToken()
    } catch {
      setError('Something went wrong.')
    } finally {
      setSaving(false)
    }
  }

  // Delete a plaid_items row — cascade removes its transactions via FK
  async function handleRemove(id: string) {
    setRemoving(true)
    const supabase = await getSupabaseClient(getToken)

    const { error } = await supabase
      .from('plaid_items')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Failed to remove account:', error)
      setError('Failed to remove account. Please try again.')
    } else {
      setAccounts(prev => prev.filter(a => a.id !== id))
    }

    setRemovingId(null)
    setRemoving(false)
  }

  const { open, ready } = usePlaidLink({
    token: linkToken ?? '',
    onSuccess: (public_token) => onSuccess(public_token),
    onExit: () => {},
  })

  return (
    <div className="page">
      <div className="connect-header">
        <h1>Connected Accounts</h1>
        <p>Link your bank accounts, credit cards, and investment accounts.</p>
      </div>

      {error && <p className="connect-error">{error}</p>}

      {/* Confirmation step — shown after Plaid Link completes */}
      {pending && (
        <div className="connect-confirm-card">
          <h2>Confirm account details</h2>
          <p className="connect-confirm-sub">
            Review and edit before importing transactions.
          </p>

          <div className="confirm-field">
            <label>Institution name</label>
            <input
              type="text"
              value={editedName}
              onChange={e => setEditedName(e.target.value)}
            />
          </div>

          <div className="confirm-field">
            <label>Account type</label>
            <div className="account-type-group">
              {ACCOUNT_TYPES.map(t => (
                <button
                  key={t.value}
                  className={`account-type-btn ${accountType === t.value ? 'account-type-btn--active' : ''}`}
                  onClick={() => setAccountType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="confirm-actions">
            <button className="btn-secondary" onClick={() => setPending(null)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={handleConfirm} disabled={saving}>
              {saving ? 'Saving...' : 'Confirm & Import'}
            </button>
          </div>
        </div>
      )}

      {/* List of connected accounts */}
      {accounts.length > 0 && !pending && (
        <div className="accounts-list">
          {accounts.map(account => (
            <div key={account.id} className="account-item">
              <div className="account-item-info">
                <span className="account-item-name">{account.institution_name ?? 'Unknown'}</span>
                <span className="account-item-type">
                  {ACCOUNT_TYPES.find(t => t.value === account.account_type)?.label ?? 'Uncategorized'}
                </span>
                <span className="account-item-date">
                  Connected {new Date(account.created_at).toLocaleDateString()}
                </span>
              </div>

              {removingId === account.id ? (
                <div className="account-confirm-remove">
                  <span>Remove account &amp; all its transactions?</span>
                  <button
                    className="btn-danger"
                    onClick={() => handleRemove(account.id)}
                    disabled={removing}
                  >
                    {removing ? 'Removing...' : 'Confirm'}
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => setRemovingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="account-remove-btn"
                  onClick={() => setRemovingId(account.id)}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add account button — always visible unless confirmation step is showing */}
      {!pending && (
        <div className="connect-add">
          {accounts.length === 0 && (
            <div className="connect-info">
              <h2>What to expect</h2>
              <ul>
                <li>🔒 Your bank credentials are never seen or stored by us</li>
                <li>📊 Transactions are imported automatically</li>
                <li>🏦 Supports thousands of banks and credit unions</li>
              </ul>
            </div>
          )}
          <button
            className="connect-btn"
            onClick={() => open()}
            disabled={!ready || loading}
          >
            {loading ? 'Initializing...' : accounts.length > 0 ? '+ Connect Another Account' : 'Connect Bank Account'}
          </button>
        </div>
      )}

      {accounts.length > 0 && !pending && (
        <p className="connect-transactions-link">
          View your imported transactions <Link to="/transactions">here</Link>.
        </p>
      )}
    </div>
  )
}
