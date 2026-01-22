import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'

/**
 * Create Supabase admin client with service role key.
 *
 * IMPORTANT: This client bypasses Row Level Security (RLS).
 * Only use for:
 * - Cron jobs that need cross-workspace access
 * - Auth callbacks that create initial workspace for new users
 * - Admin operations that must bypass RLS
 *
 * NEVER expose this client to user-facing code or pass user input directly.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing Supabase admin configuration (SUPABASE_SERVICE_ROLE_KEY)')
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
