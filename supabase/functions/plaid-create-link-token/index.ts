// plaid-create-link-token/index.ts
// Creates a Plaid link token and returns it to the frontend.
// The frontend uses this token to open the Plaid Link UI.
// This runs server-side so the Plaid secret key never touches the browser.

const PLAID_CLIENT_ID = Deno.env.get('PLAID_CLIENT_ID')!
const PLAID_SECRET = Deno.env.get('PLAID_SECRET')!
const PLAID_ENV = (Deno.env.get('PLAID_ENV') ?? 'sandbox').trim().toLowerCase()

const PLAID_BASE_URLS: Record<string, string> = {
  sandbox: 'https://sandbox.plaid.com',
  development: 'https://development.plaid.com',
  production: 'https://production.plaid.com',
}

const PLAID_BASE_URL = PLAID_BASE_URLS[PLAID_ENV] ?? 'https://sandbox.plaid.com'

// CORS headers — required for browser requests from localhost and your deployed domain
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle preflight requests — browsers send these before the real request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  try {
    const { userId } = await req.json()

    if (!userId) {
      return new Response('Missing userId', { status: 400, headers: corsHeaders })
    }

    // Ask Plaid to create a link token for this user
    const response = await fetch(`${PLAID_BASE_URL}/link/token/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: PLAID_CLIENT_ID,
        secret: PLAID_SECRET,
        client_name: 'Finance Analyzer',
        user: { client_user_id: userId },
        products: ['transactions'],
        optional_products: ['investments', 'liabilities'],
        country_codes: ['US'],
        language: 'en',
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Plaid error:', data)
      return new Response(JSON.stringify(data), { status: response.status, headers: corsHeaders })
    }

    // Return the link_token to the frontend
    return new Response(JSON.stringify({ link_token: data.link_token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response('Internal server error', { status: 500, headers: corsHeaders })
  }
})
