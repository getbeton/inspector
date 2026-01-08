import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './types'

/**
 * Create Supabase client for server components and API routes
 * Handles cookie-based session management
 */
export async function createClient() {
  const cookieStore = await cookies()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // The `setAll` method was called from a Server Component.
          // This can be ignored if you have middleware refreshing
          // user sessions.
        }
      }
    }
  })
}

/**
 * Get the current authenticated user
 * Returns null if not authenticated
 */
export async function getUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error
  } = await supabase.auth.getUser()

  if (error || !user) {
    return null
  }

  return user
}

/**
 * Get the current session
 * Returns null if not authenticated
 */
export async function getSession() {
  const supabase = await createClient()
  const {
    data: { session },
    error
  } = await supabase.auth.getSession()

  if (error || !session) {
    return null
  }

  return session
}

type WorkspaceMemberWithWorkspace = {
  workspace_id: string
  workspaces: { id: string; name: string; slug: string } | null
}

/**
 * Get user's workspace ID
 * Fetches from workspace_members table based on user ID
 */
export async function getUserWorkspace() {
  const supabase = await createClient()
  const user = await getUser()

  if (!user) {
    return null
  }

  const { data: rawData, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, workspaces(id, name, slug)')
    .eq('user_id', user.id)
    .single()

  const data = rawData as WorkspaceMemberWithWorkspace | null

  if (error || !data) {
    return null
  }

  return {
    workspaceId: data.workspace_id,
    workspace: data.workspaces
  }
}

/**
 * Require authentication - throws if not authenticated
 * Use in API routes that require auth
 */
export async function requireAuth() {
  const user = await getUser()

  if (!user) {
    throw new Error('Unauthorized')
  }

  return user
}

/**
 * Require workspace context - throws if no workspace
 * Use in API routes that need workspace isolation
 */
export async function requireWorkspace() {
  const user = await requireAuth()
  const workspaceData = await getUserWorkspace()

  if (!workspaceData) {
    throw new Error('No workspace found for user')
  }

  return {
    user,
    workspaceId: workspaceData.workspaceId,
    workspace: workspaceData.workspace
  }
}
