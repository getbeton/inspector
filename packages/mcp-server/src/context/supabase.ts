/**
 * Supabase client factories for the MCP server
 *
 * Creates two types of clients:
 * 1. User client — authenticated with the user's JWT, RLS applies
 * 2. Admin client — uses service role key, bypasses RLS (for memory tools)
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/copied/supabase-types.js'

/**
 * Create a Supabase client authenticated with a user's JWT.
 * RLS policies are active — queries only return data the user can access.
 */
export function createUserClient(jwt: string): SupabaseClient<Database> {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required')
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    },
  })
}

/**
 * Create a Supabase admin client with service role key.
 * Bypasses RLS — all queries must explicitly filter by workspace_id.
 */
export function createAdminClient(): SupabaseClient<Database> {
  const supabaseUrl = process.env.SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
