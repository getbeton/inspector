import { redirect } from 'next/navigation'
import { type SessionUser } from './constants'
import { createClient } from '@/lib/supabase/server'

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
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return null
    }

    // Get workspace membership
    const { data: rawMembership } = await supabase
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, slug)')
      .eq('user_id', user.id)
      .single()

    const membership = rawMembership as WorkspaceMembership | null

    // Build session user object
    const sessionUser: SessionUser = {
      sub: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      workspace_id: membership?.workspace_id,
      workspace_name: membership?.workspaces?.name,
      role: membership?.role
    }

    return sessionUser
  } catch (error) {
    console.error('Failed to get session:', error)
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
