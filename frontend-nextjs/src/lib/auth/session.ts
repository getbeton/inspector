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
  try {
    const supabase = await createClient()

    // Get authenticated user from Supabase
    console.log('[getSession] Calling supabase.auth.getUser()...')
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.log('[getSession] Auth error:', authError.message)
      return null
    }

    if (!user) {
      console.log('[getSession] No user found')
      return null
    }

    console.log('[getSession] User found:', user.id, user.email)

    // Get workspace membership using admin client to bypass RLS
    // This is safe because we've already authenticated the user above
    // and we're only fetching THEIR membership (filtered by user_id)
    console.log('[getSession] Querying workspace_members for user:', user.id)
    const adminClient = createAdminClient()
    const { data: rawMembership, error: membershipError } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, slug)')
      .eq('user_id', user.id)
      .single()

    if (membershipError) {
      console.log('[getSession] Workspace membership query error:', membershipError.message, membershipError.code)
    }

    const membership = rawMembership as WorkspaceMembership | null
    console.log('[getSession] Membership found:', !!membership, membership?.workspace_id)

    // Build session user object
    const sessionUser: SessionUser = {
      sub: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      workspace_id: membership?.workspace_id,
      workspace_name: membership?.workspaces?.name,
      role: membership?.role
    }

    console.log('[getSession] Returning session for:', sessionUser.sub, 'workspace:', sessionUser.workspace_id)
    return sessionUser
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
