'use client'

import { createClient } from '@supabase/supabase-js'

// Client-side Supabase client for OAuth flow
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

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
