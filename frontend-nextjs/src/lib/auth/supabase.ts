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
 * Redirects to Supabase OAuth endpoint, which then redirects to backend callback
 */
export async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Redirect to backend OAuth callback endpoint
      // Backend handles JWT validation, workspace creation, and session cookie
      redirectTo: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/oauth/callback`
    }
  })

  return { data, error }
}

/**
 * Sign out the current user
 * Clears session cookie via backend
 */
export async function signOut() {
  // Call backend logout endpoint to clear session cookie
  const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/auth/logout`, {
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
