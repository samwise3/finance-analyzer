// plaid-exchange-token/index.ts
// Exchanges a public_token (from Plaid Link UI) for a permanent access_token.
// Also fetches the institution name from Plaid and returns it to the frontend
// so the user can confirm/edit it before the item is saved to Supabase.
// The actual save happens in plaid-save-item once the user confirms.

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
    const { public_token, userId } = await req.json()

    if (!public_token || !userId) {
      return new Response('Missing public_token or userId', { status: 400, headers: corsHeaders })
    }

    // Step 1 — exchange the public_token for a permanent access_token
    const exchangeRes = await fetch(`${PLAID_BASE_URL}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        public_token,
      }),
    })

    const exchangeData = await exchangeRes.json()

    if (!exchangeRes.ok) {
      console.error('Plaid exchange error:', exchangeData)
      return new Response(JSON.stringify(exchangeData), { status: exchangeRes.status, headers: corsHeaders })
    }

    const { access_token, item_id } = exchangeData

    // Step 2 — fetch the item details to get the institution ID
    const itemRes = await fetch(`${PLAID_BASE_URL}/item/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        access_token,
      }),
    })

    const itemData = await itemRes.json()
    const institutionId = itemData.item?.institution_id

    // Step 3 — fetch the institution name using the institution ID
    let institutionName = 'Unknown Institution'

    if (institutionId) {
      const instRes = await fetch(`${PLAID_BASE_URL}/institutions/get_by_id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          institution_id: institutionId,
          country_codes: ['US'],
        }),
      })

      const instData = await instRes.json()
      institutionName = instData.institution?.name ?? 'Unknown Institution'
    }

    // Step 4 — store the access_token in Supabase
    // institution_name and account_type can be updated later by the user
    const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/plaid_items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        access_token,
        item_id,
        institution_name: institutionName,
      }),
    })

    if (!supabaseRes.ok) {
      const err = await supabaseRes.json()
      console.error('Supabase insert error:', err)
      return new Response('Failed to store access token', { status: 500, headers: corsHeaders })
    }

    // Return the institution name and item_id to the frontend
    // so the user can confirm/edit before syncing
    return new Response(JSON.stringify({
      success: true,
      item_id,
      institution_name: institutionName,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
})
