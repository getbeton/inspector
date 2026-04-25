import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { type SessionUser, type WorkspaceMembership, ACTIVE_WORKSPACE_COOKIE } from './constants'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Re-export for convenience
export { SESSION_COOKIE_NAME, ACTIVE_WORKSPACE_COOKIE, type SessionUser, type WorkspaceMembership } from './constants'

// Type for workspace membership query result (raw DB row)
type WorkspaceMembershipRow = {
  workspace_id: string
  role: string
  workspaces: { id: string; name: string; slug: string } | null
}

/**
 * Get the current session using Supabase Auth
 * Returns user info with all workspace memberships and active workspace context.
 *
 * Active workspace resolution order:
 * 1. `beton_active_workspace` cookie
 * 2. First workspace in membership list
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
      workspace_slug: undefined,
      role: undefined,
      workspaces: [],
    }
  }

  try {
    const supabase = await createClient()

    // Get authenticated user from Supabase
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return null
    }

    // Get ALL workspace memberships using admin client to bypass RLS
    const adminClient = createAdminClient()
    const { data: rawMemberships, error: membershipError } = await adminClient
      .from('workspace_members')
      .select('workspace_id, role, workspaces(id, name, slug)')
      .eq('user_id', user.id)

    if (membershipError) {
      console.error('[getSession] Membership query failed:', membershipError.code, membershipError.message)
    }

    const memberships = (rawMemberships as WorkspaceMembershipRow[] | null) ?? []

    // Build workspace list
    const workspaces: WorkspaceMembership[] = memberships
      .filter(m => m.workspaces)
      .map(m => ({
        workspace_id: m.workspace_id,
        workspace_name: m.workspaces!.name,
        workspace_slug: m.workspaces!.slug,
        role: m.role,
      }))

    // Resolve active workspace: cookie → first membership
    const cookieStore = await cookies()
    const activeWorkspaceCookie = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value
    let active = workspaces.find(w => w.workspace_id === activeWorkspaceCookie)
    if (!active && workspaces.length > 0) {
      active = workspaces[0]
    }

    return {
      sub: user.id,
      email: user.email || '',
      name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
      workspace_id: active?.workspace_id,
      workspace_name: active?.workspace_name,
      workspace_slug: active?.workspace_slug,
      role: active?.role,
      workspaces,
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
