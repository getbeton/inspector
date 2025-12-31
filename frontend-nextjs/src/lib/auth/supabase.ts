'use client'

import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase client (avoids build-time errors when env vars aren't available)
let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase environment variables are not configured')
    }

    _supabase = createClient(supabaseUrl, supabaseAnonKey)
  }
  return _supabase
}

// Backward compatibility - will throw at runtime if env vars missing, not at build time
export const supabase = typeof window !== 'undefined'
  ? getSupabase()
  : (null as unknown as SupabaseClient)

/**
 * Trigger Google OAuth sign-in
 * Redirects to Supabase OAuth endpoint, which then redirects to our callback
 */
export async function signInWithGoogle() {
  // Use frontend origin for redirect - Next.js proxies /api/* to backend
  // This keeps cookies on the same domain (frontend) solving cross-domain issues
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Redirect through frontend proxy (Next.js rewrites /api/* to backend)
      // This ensures session cookie is set on frontend domain
      redirectTo: `${origin}/api/oauth/callback`
    }
  })

  return { data, error }
}

/**
 * Sign out the current user
 * Clears session cookie via backend
 */
export async function signOut() {
  // Call logout endpoint through proxy (relative URL = same domain = cookies work)
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  })

  if (!response.ok) {
    throw new Error('Failed to sign out')
  }

  return true
}

/**
 * Verify Supabase credentials are configured
 */
export function verifySupabaseConfig(): boolean {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable')
    return false
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable')
    return false
  }

  return true
}
