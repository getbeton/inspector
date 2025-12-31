/**
 * Session constants and types
 * Shared across server and client components
 */

export const SESSION_COOKIE_NAME = 'beton_session'

export interface SessionUser {
  sub: string
  email: string
  name: string
  workspace_id?: string
  workspace_name?: string
  role?: string
}
