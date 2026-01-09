/**
 * RLS Context Middleware
 *
 * ⚠️ CRITICAL SECURITY COMPONENT ⚠️
 *
 * This middleware MUST be applied to ALL API routes that access PostHog query tables.
 * It sets the PostgreSQL session variable `app.workspace_id` which is used by
 * Row Level Security (RLS) policies to enforce multi-tenant data isolation.
 *
 * If this middleware fails to set the context, the request MUST abort.
 * Allowing queries without proper context = SECURITY BREACH (cross-tenant data access)
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any

/** Context passed to route handlers after RLS is set */
export interface RLSContext {
  /** Supabase client with RLS context already set */
  supabase: AnySupabaseClient
  /** Current workspace ID */
  workspaceId: string
  /** Current user ID */
  userId: string
  /** User's role in the workspace */
  role: string
}

/** Route handler with RLS context */
export type RLSRouteHandler = (
  request: NextRequest,
  context: RLSContext
) => Promise<NextResponse>

/**
 * Error returned when RLS context cannot be established
 */
export class RLSContextError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number = 500) {
    super(message)
    this.name = 'RLSContextError'
    this.statusCode = statusCode
  }
}

/**
 * Set the RLS workspace context on a Supabase client
 *
 * @param supabase - Supabase client instance
 * @param workspaceId - Workspace UUID to set as context
 * @throws RLSContextError if context setting fails
 */
export async function setRLSContext(
  supabase: AnySupabaseClient,
  workspaceId: string
): Promise<void> {
  const { error } = await supabase.rpc('set_workspace_context', {
    workspace_uuid: workspaceId,
  })

  if (error) {
    console.error('[RLS] Failed to set workspace context:', error)
    throw new RLSContextError(
      'Failed to establish security context',
      500
    )
  }

  console.log(`[RLS] Workspace context set: ${workspaceId.substring(0, 8)}...`)
}

/**
 * Wrap an API route handler with RLS context middleware
 *
 * This middleware:
 * 1. Authenticates the user
 * 2. Gets their workspace membership
 * 3. Sets the RLS context via set_workspace_context()
 * 4. Passes the context to the handler
 *
 * If any step fails, returns an error response WITHOUT executing the handler.
 *
 * @example
 * ```typescript
 * export const GET = withRLSContext(async (request, { supabase, workspaceId }) => {
 *   // RLS context is already set - safe to query
 *   const { data } = await supabase.from('posthog_queries').select('*')
 *   return NextResponse.json({ data })
 * })
 * ```
 */
export function withRLSContext(handler: RLSRouteHandler) {
  return async (request: NextRequest): Promise<NextResponse> => {
    try {
      // Step 1: Create Supabase client
      const supabase = await createClient()

      // Step 2: Verify authentication
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        console.warn('[RLS] Unauthenticated request')
        return NextResponse.json(
          {
            error: 'Authentication required',
            error_code: 'UNAUTHENTICATED',
            retryable: false,
          },
          { status: 401 }
        )
      }

      // Step 3: Get workspace membership
      const membership = await getWorkspaceMembership()

      if (!membership) {
        console.warn(`[RLS] User ${user.id} has no workspace membership`)
        return NextResponse.json(
          {
            error: 'No workspace found for user',
            error_code: 'NO_WORKSPACE',
            retryable: false,
          },
          { status: 403 }
        )
      }

      // Step 4: Set RLS context (CRITICAL)
      await setRLSContext(supabase, membership.workspaceId)

      // Step 5: Execute handler with context
      const context: RLSContext = {
        supabase,
        workspaceId: membership.workspaceId,
        userId: membership.userId,
        role: membership.role,
      }

      return await handler(request, context)
    } catch (error) {
      // Handle RLS-specific errors
      if (error instanceof RLSContextError) {
        return NextResponse.json(
          {
            error: error.message,
            error_code: 'RLS_CONTEXT_FAILURE',
            retryable: false,
          },
          { status: error.statusCode }
        )
      }

      // Log unexpected errors
      console.error('[RLS] Unexpected error in middleware:', error)

      return NextResponse.json(
        {
          error: 'Internal server error',
          error_code: 'INTERNAL_ERROR',
          retryable: true,
        },
        { status: 500 }
      )
    }
  }
}

/**
 * Verify that RLS context is properly set
 * Use this in tests to verify isolation
 */
export async function verifyRLSContext(
  supabase: AnySupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_workspace_context')

  if (error) {
    console.error('[RLS] Failed to verify context:', error)
    return null
  }

  return data as string | null
}
