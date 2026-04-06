/**
 * Session constants and types
 * Shared across server and client components
 */

export const SESSION_COOKIE_NAME = 'beton_session'
export const ACTIVE_WORKSPACE_COOKIE = 'beton_active_workspace'

export interface WorkspaceMembership {
  workspace_id: string
  workspace_name: string
  workspace_slug: string
  role: string
}

export interface SessionUser {
  sub: string
  email: string
  name: string
  workspace_id?: string
  workspace_name?: string
  workspace_slug?: string
  role?: string
  workspaces: WorkspaceMembership[]
}
