import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!
const PLAID_SECRET    = Deno.env.get('PLAID_SECRET')!
const PLAID_ENV       = (Deno.env.get('PLAID_ENV') ?? 'sandbox').trim().toLowerCase()

const PLAID_BASE_URLS: Record<string, string> = {
  sandbox:     'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production:  'https://production.plaid.com',
}
const PLAID_BASE_URL = PLAID_BASE_URLS[PLAID_ENV] ?? 'https://sandbox.plaid.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  try {
    const { userId } = await req.json()
    if (!userId) return new Response('Missing userId', { status: 400, headers: corsHeaders })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: items, error } = await supabase
      .from('plaid_items')
      .select('item_id, institution_name, access_token')
      .eq('user_id', userId)

    if (error || !items || items.length === 0) {
      return new Response(JSON.stringify({ credit: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await Promise.all(
      items.map(async (item: any) => {
        if (!item.access_token) return null

        const res = await fetch(`${PLAID_BASE_URL}/liabilities/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:    PLAID_CLIENT_ID,
            secret:       PLAID_SECRET,
            access_token: item.access_token,
          }),
        })

        if (!res.ok) {
          console.error(`Liabilities fetch failed for item ${item.item_id}:`, await res.text())
          return null
        }

        const data = await res.json()
        const creditLiabilities: Record<string, any> = {}
        for (const c of (data.liabilities?.credit ?? [])) {
          creditLiabilities[c.account_id] = c
        }

        return (data.accounts ?? [])
          .filter((a: any) => a.type === 'credit')
          .map((acct: any) => {
            const liability   = creditLiabilities[acct.account_id] ?? {}
            const purchaseApr = (liability.aprs ?? []).find((a: any) => a.apr_type === 'purchase_apr')
            return {
              account_id:             acct.account_id,
              institution_name:       item.institution_name,
              name:                   acct.name,
              official_name:          acct.official_name ?? null,
              current:                acct.balances.current,
              available:              acct.balances.available,
              limit:                  acct.balances.limit,
              minimum_payment:        liability.minimum_payment_amount  ?? null,
              next_payment_due_date:  liability.next_payment_due_date   ?? null,
              last_payment_amount:    liability.last_payment_amount      ?? null,
              last_payment_date:      liability.last_payment_date        ?? null,
              last_statement_balance: liability.last_statement_balance   ?? null,
              is_overdue:             liability.is_overdue               ?? false,
              purchase_apr:           purchaseApr?.apr_percentage        ?? null,
            }
          })
      })
    )

    const credit = results.flat().filter(Boolean)
    return new Response(JSON.stringify({ credit }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('plaid-get-liabilities error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
