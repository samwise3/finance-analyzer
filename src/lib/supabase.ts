import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Creates a Supabase client authenticated with the current Clerk session token.
 * Pass the `getToken` function from Clerk's `useAuth()` hook.
 *
 * Usage:
 *   const { getToken } = useAuth()
 *   const supabase = makeSupabaseClient(getToken)
 */
export function makeSupabaseClient(
  getToken: () => Promise<string | null>
) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      fetch: async (url, options = {}) => {
        const token = await getToken()
        const headers = new Headers((options as RequestInit).headers)
        if (token) headers.set('Authorization', `Bearer ${token}`)
        return fetch(url, { ...options, headers })
      },
    },
  })
}

/**
 * Unauthenticated Supabase client — only use for public (non-RLS) data.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
