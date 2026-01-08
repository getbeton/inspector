import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * POST /api/auth/logout - Sign out the current user
 * Clears Supabase session cookies
 */
export async function POST() {
  try {
    const supabase = await createClient()

    // Sign out from Supabase (clears session cookies)
    const { error } = await supabase.auth.signOut()

    if (error) {
      console.error('[Logout] Error signing out:', error.message)
      return NextResponse.json(
        { error: 'Failed to sign out' },
        { status: 500 }
      )
    }

    // Redirect to login page
    return NextResponse.json({ success: true, redirect: '/login' })
  } catch (error) {
    console.error('[Logout] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
