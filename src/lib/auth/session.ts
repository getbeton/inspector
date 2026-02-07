import { redirect } from 'next/navigation'
import { type SessionUser } from './constants'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Re-export for convenience
export { SESSION_COOKIE_NAME, type SessionUser } from './constants'

// Type for workspace membership query result
type WorkspaceMembership = {
  workspace_id: string
  role: string
  workspaces: { id: string; name: string; slug: string } | null
}

/**
 * Get the current session using Supabase Auth
 * Returns user info with workspace context
 */
export async function getSession(): Promise<SessionUser | null> {
  // Return a stub session when auth is bypassed (test/preview deployments)
  if (process.env.AUTH_BYPASS === 'true') {
    return {
      sub: 'auth-bypass',
      email: 'bypass@localhost',
      name: 'Auth Bypass',
      workspace_id: undefined,
      workspace_name: undefined,
      role: undefined,
    }
  }

  try {
    const supabase = await createClient()

    // Get authenticated user from Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return null
    }

    // Get workspace membership using admin client to bypass RLS
    // This is safe because we've already authenticated the user above
    // and we're only fetching THEIR membership (filtered by user_id)
    const adminClient = createAdminClient()
    const { data: rawMembership, error: membershipError } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, slug)')
      .eq('user_id', user.id)
      .single()

    // Log actual database errors (PGRST116 = no rows found, which is expected for new users)
    if (membershipError && membershipError.code !== 'PGRST116') {
      console.error('[getSession] Membership query failed:', membershipError.code, membershipError.message)
    }

    const membership = rawMembership as WorkspaceMembership | null

    // Build session user object
    return {
      sub: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      workspace_id: membership?.workspace_id,
      workspace_name: membership?.workspaces?.name,
      role: membership?.role
    }
  } catch (error) {
    console.error('[getSession] Exception:', error)
    return null
  }
}

/**
 * Require authentication - redirect to login if not authenticated
 */
export async function requireAuth(): Promise<SessionUser> {
  const session = await getSession()

  if (!session) {
    redirect('/login')
  }

  return session
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return session !== null
}
