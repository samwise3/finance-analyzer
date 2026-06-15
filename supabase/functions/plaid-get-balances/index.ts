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
      .select('item_id, institution_name, account_type, access_token')
      .eq('user_id', userId)

    if (error || !items || items.length === 0) {
      return new Response(JSON.stringify({ accounts: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = await Promise.all(
      items.map(async (item: any) => {
        if (!item.access_token) return null

        const res = await fetch(`${PLAID_BASE_URL}/accounts/balance/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id:    PLAID_CLIENT_ID,
            secret:       PLAID_SECRET,
            access_token: item.access_token,
          }),
        })

        if (!res.ok) {
          console.error(`Balance fetch failed for item ${item.item_id}:`, await res.text())
          return null
        }

        const data = await res.json()
        return (data.accounts ?? []).map((acct: any) => ({
          institution_name:   item.institution_name,
          account_type_label: item.account_type,
          account_id:         acct.account_id,
          name:               acct.name,
          official_name:      acct.official_name,
          type:               acct.type,
          subtype:            acct.subtype,
          current:            acct.balances.current,
          available:          acct.balances.available,
          limit:              acct.balances.limit,
          iso_currency:       acct.balances.iso_currency_code,
        }))
      })
    )

    const accounts = results.flat().filter(Boolean)
    return new Response(JSON.stringify({ accounts }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('plaid-get-balances error:', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
