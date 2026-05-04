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
 *
 * @param next — optional post-login redirect path (used by MCP OAuth flow to
 *               return to /api/mcp/authorize after login)
 */
export async function signInWithGoogle(next?: string) {
  // Use frontend origin for redirect to Next.js auth callback handler
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  // Build callback URL — thread `next` through so /auth/callback redirects there
  let redirectTo = `${origin}/auth/callback`
  if (next) {
    redirectTo += `?next=${encodeURIComponent(next)}`
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      // Redirect to Next.js auth callback handler (handles session + workspace creation)
      redirectTo,
      // Force Google to show account picker even if user is already logged in
      queryParams: {
        prompt: 'select_account'
      }
    }
  })

  return { data, error }
}

/**
 * Trigger GitHub OAuth sign-in.
 * Mirrors signInWithGoogle — same redirect handling, same callback flow.
 */
export async function signInWithGithub(next?: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  let redirectTo = `${origin}/auth/callback`
  if (next) {
    redirectTo += `?next=${encodeURIComponent(next)}`
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo,
      // Read user email + basic profile only
      scopes: 'read:user user:email',
    },
  })

  return { data, error }
}

/**
 * Send a magic-link / OTP email. The link in the email points to
 * /auth/callback?code=… which the existing route handles uniformly.
 */
export async function signInWithEmail(email: string, next?: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  let emailRedirectTo = `${origin}/auth/callback`
  if (next) {
    emailRedirectTo += `?next=${encodeURIComponent(next)}`
  }

  const { data, error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      // Auto-create the auth user on first sign-in (matches Google flow's
      // user-creation-on-first-login expectation).
      shouldCreateUser: true,
    },
  })

  return { data, error }
}

/**
 * Sign out the current user
 * Clears Supabase session via API and redirects to login
 */
export async function signOut() {
  // Call logout endpoint
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include'
  })

  if (!response.ok) {
    throw new Error('Failed to sign out')
  }

  const data = await response.json()

  // Redirect to login page
  if (typeof window !== 'undefined') {
    window.location.href = data.redirect || '/login'
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
