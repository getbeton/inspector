'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// Lazy-initialized Supabase browser client (uses cookies for PKCE, not localStorage)
let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase environment variables are not configured')
    }

    // Use createBrowserClient from @supabase/ssr - this stores PKCE verifier in cookies
    // so the server-side callback handler can access it
    _supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
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
  // Use frontend origin for redirect to Next.js auth callback handler
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Redirect to Next.js auth callback handler (handles session + workspace creation)
      redirectTo: `${origin}/auth/callback`
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
