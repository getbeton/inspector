import { createClient } from './server'

export interface WorkspaceMember {
  workspace_id: string
  user_id: string
  role: string
}

/**
 * Get workspace membership for current user
 * Returns null if user has no workspace
 */
export async function getWorkspaceMembership() {
  const supabase = await createClient()

  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) {
    return null
  }

  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id, user_id, role')
    .eq('user_id', user.id)
    .single()

  if (!data) {
    return null
  }

  return {
    workspaceId: (data as WorkspaceMember).workspace_id,
    userId: (data as WorkspaceMember).user_id,
    role: (data as WorkspaceMember).role
  }
}

/**
 * Require workspace context
 * Returns workspace ID or throws error
 */
export async function requireWorkspaceId(): Promise<string> {
  const membership = await getWorkspaceMembership()

  if (!membership) {
    throw new Error('No workspace found')
  }

  return membership.workspaceId
}
