import { createClient } from './server'

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: string
}

/**
 * Get workspace membership for current user
 * Resolution: explicit workspaceId → active workspace cookie → first membership
 */
export async function getWorkspaceMembership(workspaceId?: string) {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  // If specific workspace requested, fetch that one
  if (workspaceId) {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id, user_id, role')
      .eq('user_id', user.id)
      .eq('workspace_id', workspaceId)
      .single()

    if (!data) return null

    return {
      workspaceId: (data as WorkspaceMember).workspace_id,
      userId: (data as WorkspaceMember).user_id,
      role: (data as WorkspaceMember).role,
    }
  }

  // Fetch all memberships, resolve active from cookie
  const { data: rows } = await supabase
    .from('workspace_members')
    .select('workspace_id, user_id, role')
    .eq('user_id', user.id)

  if (!rows || rows.length === 0) return null

  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const activeId = cookieStore.get('beton_active_workspace')?.value

  const match = (rows as WorkspaceMember[]).find(r => r.workspace_id === activeId)
    ?? rows[0] as WorkspaceMember

  return {
    workspaceId: match.workspace_id,
    userId: match.user_id,
    role: match.role,
  }
}

/**
 * Require workspace context
 * Returns workspace ID or throws error
 */
export async function requireWorkspaceId(workspaceId?: string): Promise<string> {
  const membership = await getWorkspaceMembership(workspaceId)

  if (!membership) {
    throw new Error('No workspace found')
  }

  return membership.workspaceId
}
