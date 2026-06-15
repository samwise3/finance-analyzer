// plaid-sync-transactions/index.ts
// Fetches transactions from Plaid using the stored access_token
// and inserts them into the transactions table in Supabase.
// Triggered automatically after a successful bank connection.

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!
const PLAID_SECRET = Deno.env.get('PLAID_SECRET')!
const PLAID_ENV = (Deno.env.get('PLAID_ENV') ?? 'sandbox').trim().toLowerCase()
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const PLAID_BASE_URLS: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
}
const PLAID_BASE_URL = PLAID_BASE_URLS[PLAID_ENV] ?? 'https://sandbox.plaid.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const { userId, item_id } = await req.json()

    if (!userId) {
      return new Response('Missing userId', { status: 400, headers: corsHeaders })
    }

    // Step 1 — fetch the access_token for this user from Supabase
    // If item_id is provided, sync only that account — otherwise sync the most recent one
    const itemFilter = item_id
      ? `user_id=eq.${userId}&item_id=eq.${item_id}&select=access_token,item_id&limit=1`
      : `user_id=eq.${userId}&select=access_token,item_id&limit=1`

    const itemRes = await fetch(
      `${SUPABASE_URL}/rest/v1/plaid_items?${itemFilter}`,
      {
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      }
    )

    const items = await itemRes.json()

    if (!items.length) {
      return new Response('No connected bank found for user', { status: 404, headers: corsHeaders })
    }

    const { access_token, item_id: resolvedItemId } = items[0]

    // Step 2 — fetch transactions from Plaid
    // Pull the last 90 days of transactions
    const today = new Date()
    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(today.getDate() - 90)

    const plaidRes = await fetch(`${PLAID_BASE_URL}/transactions/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token,
        start_date: ninetyDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
      }),
    })

    const plaidData = await plaidRes.json()

    if (!plaidRes.ok) {
      console.error('Plaid transactions error:', plaidData)
      return new Response(JSON.stringify(plaidData), { status: plaidRes.status, headers: corsHeaders })
    }

    // Step 3 — map Plaid transactions to your transactions table shape
    const transactions = plaidData.transactions.map((t: any) => ({
      user_id: userId,
      date: t.date,
      description: t.name,
      amount: t.amount * -1, // Plaid uses positive for debits, we use negative
      category: t.personal_finance_category?.primary ?? null,
      item_id: resolvedItemId, // links transaction to the plaid_items row
    }))

    // Step 4 — insert into Supabase, skipping duplicates
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/transactions?on_conflict=user_id,date,description,amount`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=minimal,resolution=merge-duplicates',
      },
      body: JSON.stringify(transactions),
    })

    if (!insertRes.ok) {
      const err = await insertRes.json()
      console.error('Insert error:', err)
      return new Response('Failed to insert transactions', { status: 500, headers: corsHeaders })
    }

    return new Response(
      JSON.stringify({ success: true, count: transactions.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
})