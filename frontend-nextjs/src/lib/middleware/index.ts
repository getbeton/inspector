/**
 * Middleware exports for PostHog Query API
 *
 * Usage:
 * ```typescript
 * import { withRLSContext, withErrorHandler } from '@/lib/middleware'
 *
 * // Combine both for full protection
 * export const POST = withErrorHandler(
 *   withRLSContext(async (request, { supabase, workspaceId }) => {
 *     // Handler with RLS context set and error handling
 *   })
 * )
 * ```
 */

// RLS Context Middleware
export {
  withRLSContext,
  setRLSContext,
  verifyRLSContext,
  RLSContextError,
  type RLSContext,
  type RLSRouteHandler,
} from './rls-context'

// Error Handler Middleware
export {
  withErrorHandler,
  type RouteHandler,
} from './error-handler'

// Re-export error types for convenience
export {
  QueryError,
  RateLimitError,
  TimeoutError,
  InvalidQueryError,
  PostHogAPIError,
  ConfigurationError,
} from './error-handler'
