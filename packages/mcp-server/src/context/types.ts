/**
 * Tool context types
 *
 * Every MCP tool handler receives a ToolContext that provides
 * authenticated access to the database and workspace scope.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/copied/supabase-types.js'

export interface ToolContext {
  /** Supabase client authenticated with the user's JWT — RLS is active */
  supabase: SupabaseClient<Database>
  /** The workspace this user belongs to */
  workspaceId: string
  /** The authenticated user's ID (from JWT sub claim) */
  userId: string
}

export interface AdminToolContext extends ToolContext {
  /** Service-role Supabase client — bypasses RLS. Use with explicit workspace_id filters. */
  adminSupabase: SupabaseClient<Database>
}
