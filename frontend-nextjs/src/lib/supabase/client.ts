'use client'

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './types'

let supabaseClient: ReturnType<typeof createBrowserClient<Database>> | null = null

/**
 * Get Supabase client for browser/client components
 * Uses singleton pattern to avoid creating multiple clients
 */
export function createClient() {
  if (supabaseClient) {
    return supabaseClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  supabaseClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

  return supabaseClient
}

/**
 * Trigger Google OAuth sign-in
 * Redirects to Supabase OAuth endpoint
 */
export async function signInWithGoogle() {
  const supabase = createClient()
  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`
    }
  })

  return { data, error }
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const supabase = createClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    throw new Error('Failed to sign out')
  }

  return true
}

/**
 * Get current session
 */
export async function getSession() {
  const supabase = createClient()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error) {
    console.error('Error getting session:', error)
    return null
  }

  return session
}

/**
 * Get current user
 */
export async function getUser() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) {
    console.error('Error getting user:', error)
    return null
  }

  return user
}
