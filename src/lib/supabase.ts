import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * A single shared Supabase client instance.
 * We use one client and update its auth token per-request
 * rather than creating a new client on every call — this
 * prevents the "Multiple GoTrueClient instances" warning.
 */
const client: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    fetch: async (url, options = {}) => {
      // getToken is set before each request via setAuthToken below
      const token = currentToken
      const headers = new Headers((options as RequestInit).headers)
      if (token) headers.set('Authorization', `Bearer ${token}`)
      return fetch(url, { ...options, headers })
    },
  },
  auth: {
    // Disable Supabase's own auth persistence — Clerk handles auth
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
})

// Holds the current Clerk JWT — updated before each request
let currentToken: string | null = null

/**
 * Returns the shared Supabase client with the Clerk token attached.
 * Call this before any Supabase query.
 *
 * Usage:
 *   const { getToken } = useAuth()
 *   const supabase = await getSupabaseClient(getToken)
 *   const { data } = await supabase.from('transactions').select('*')
 */
export async function getSupabaseClient(
  getToken: (options?: Record<string, unknown>) => Promise<string | null>
): Promise<SupabaseClient> {
  currentToken = await getToken({ template: 'supabase' })
  return client
}
