/**
 * Workspace resolution from authenticated context
 *
 * Resolves a user's JWT to their workspace membership.
 * Also handles API key authentication as a fallback.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { compare } from 'bcryptjs'
import type { Database } from '../lib/copied/supabase-types.js'
import { createUserClient, createAdminClient } from './supabase.js'
import { validateJWT, extractBearerToken } from '../auth/jwt.js'
import type { ToolContext, AdminToolContext } from './types.js'

/**
 * Resolve workspace membership from a user's Supabase client.
 *
 * @returns workspace_id and user_id, or null if no membership found
 */
async function resolveWorkspaceMembership(
  supabase: SupabaseClient<Database>,
  userId: string
): Promise<{ workspaceId: string; role: string } | null> {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId)
    .single()

  if (!data) return null

  return {
    workspaceId: data.workspace_id,
    role: data.role,
  }
}

/**
 * Build a ToolContext from an Authorization header.
 * Supports both JWT Bearer tokens and API key (beton_*) authentication.
 *
 * @param authHeader - The Authorization header value
 * @returns ToolContext with authenticated Supabase client and workspace scope
 * @throws Error if authentication fails
 */
export async function resolveContext(authHeader: string | undefined): Promise<ToolContext> {
  // Try API key auth first (beton_* prefix)
  if (authHeader?.startsWith('Bearer beton_')) {
    return resolveApiKeyContext(authHeader.slice(7))
  }

  // JWT Bearer token auth
  const token = extractBearerToken(authHeader)
  if (!token) {
    throw new AuthError('Missing or invalid Authorization header')
  }

  const validated = await validateJWT(token)
  const supabase = createUserClient(validated.raw)

  const membership = await resolveWorkspaceMembership(supabase, validated.sub)
  if (!membership) {
    throw new AuthError('User has no workspace membership')
  }

  return {
    supabase,
    workspaceId: membership.workspaceId,
    userId: validated.sub,
  }
}

/**
 * Build a ToolContext with admin access (for memory tools that need service role).
 */
export async function resolveAdminContext(authHeader: string | undefined): Promise<AdminToolContext> {
  const baseContext = await resolveContext(authHeader)
  const adminSupabase = createAdminClient()

  return {
    ...baseContext,
    adminSupabase,
  }
}

/**
 * Resolve context from a Beton API key (beton_* prefix).
 * Hashes the key with bcrypt and looks it up in the api_keys table.
 */
async function resolveApiKeyContext(apiKey: string): Promise<ToolContext> {
  const adminSupabase = createAdminClient()

  // Fetch all non-expired keys for comparison
  const { data: keys, error } = await adminSupabase
    .from('api_keys')
    .select('key_hash, workspace_id, user_id, expires_at')
    .gt('expires_at', new Date().toISOString())

  if (error || !keys?.length) {
    throw new AuthError('Invalid API key')
  }

  // Compare against stored hashes
  for (const key of keys) {
    const matches = await compare(apiKey, key.key_hash)
    if (matches) {
      // Update last_used_at
      await adminSupabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('key_hash', key.key_hash)

      return {
        supabase: adminSupabase, // API key auth uses admin client
        workspaceId: key.workspace_id,
        userId: key.user_id,
      }
    }
  }

  throw new AuthError('Invalid API key')
}

/**
 * Custom error class for authentication failures.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthError'
  }
}
