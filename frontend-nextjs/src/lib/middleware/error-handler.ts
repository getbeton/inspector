/**
 * Error Handler Middleware
 *
 * Provides consistent error response format across all PostHog query API endpoints.
 * Catches QueryError subclasses and returns appropriate HTTP responses.
 */

import { NextResponse, type NextRequest } from 'next/server'
import {
  QueryError,
  RateLimitError,
  TimeoutError,
  InvalidQueryError,
  PostHogAPIError,
  ConfigurationError,
  isQueryError,
  isRateLimitError,
  isTimeoutError,
  isInvalidQueryError,
  isPostHogAPIError,
} from '@/lib/errors/query-errors'
import type { QueryErrorResponse } from '@/lib/types/posthog-query'

/** Route handler type */
export type RouteHandler = (
  request: NextRequest,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...args: any[]
) => Promise<NextResponse>

/**
 * Map error to HTTP status code
 */
function getStatusCode(error: unknown): number {
  if (isRateLimitError(error)) {
    return 429 // Too Many Requests
  }

  if (isInvalidQueryError(error)) {
    return 400 // Bad Request
  }

  if (isTimeoutError(error)) {
    return 504 // Gateway Timeout
  }

  if (isPostHogAPIError(error)) {
    // Use PostHog's status code if available, otherwise 502
    return error.statusCode ?? 502
  }

  if (error instanceof ConfigurationError) {
    return 503 // Service Unavailable
  }

  if (isQueryError(error)) {
    return 500 // Internal Server Error
  }

  return 500
}

/**
 * Format error for API response
 */
function formatErrorResponse(error: unknown): QueryErrorResponse {
  if (isQueryError(error)) {
    return {
      error: error.message,
      error_code: error.code,
      details: error.details,
      retryable: error.retryable,
    }
  }

  if (error instanceof Error) {
    return {
      error: error.message,
      error_code: 'UNKNOWN_ERROR',
      retryable: true,
    }
  }

  return {
    error: 'An unexpected error occurred',
    error_code: 'UNKNOWN_ERROR',
    retryable: true,
  }
}

/**
 * Get additional headers for error response
 */
function getErrorHeaders(error: unknown): Record<string, string> {
  const headers: Record<string, string> = {}

  if (isRateLimitError(error)) {
    // Calculate seconds until reset
    const now = Date.now()
    const resetTime = error.resetAt.getTime()
    const retryAfter = Math.max(0, Math.ceil((resetTime - now) / 1000))

    headers['Retry-After'] = String(retryAfter || 3600) // Default to 1 hour
    headers['X-RateLimit-Limit'] = String(error.limit)
    headers['X-RateLimit-Remaining'] = String(error.remaining)
    headers['X-RateLimit-Reset'] = error.resetAt.toISOString()
  }

  return headers
}

/**
 * Wrap an API route handler with error handling middleware
 *
 * This middleware:
 * 1. Catches all QueryError subclasses
 * 2. Returns consistent JSON error format
 * 3. Sets appropriate HTTP status codes
 * 4. Adds Retry-After header for rate limits
 * 5. Logs unexpected errors
 *
 * @example
 * ```typescript
 * export const POST = withErrorHandler(async (request) => {
 *   // Errors thrown here are caught and formatted
 *   throw new InvalidQueryError('Query too long')
 * })
 * ```
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (request: NextRequest, ...args): Promise<NextResponse> => {
    try {
      return await handler(request, ...args)
    } catch (error) {
      // Log all errors for debugging
      const isExpectedError = isQueryError(error)

      if (!isExpectedError) {
        console.error('[ErrorHandler] Unexpected error:', error)
      } else {
        console.warn(
          `[ErrorHandler] ${error.code}:`,
          error.message,
          error.details
        )
      }

      // Format response
      const statusCode = getStatusCode(error)
      const body = formatErrorResponse(error)
      const headers = getErrorHeaders(error)

      return NextResponse.json(body, {
        status: statusCode,
        headers,
      })
    }
  }
}

/**
 * Combine RLS context and error handling middleware
 *
 * This is the recommended way to wrap PostHog query API routes.
 * It provides both security (RLS) and consistent error handling.
 *
 * @example
 * ```typescript
 * import { withRLSContext, type RLSContext } from '@/lib/middleware/rls-context'
 * import { withErrorHandler } from '@/lib/middleware/error-handler'
 * import { withPostHogQueryMiddleware } from '@/lib/middleware/error-handler'
 *
 * export const POST = withPostHogQueryMiddleware(async (request, context) => {
 *   // Both RLS context is set AND errors are handled
 *   const { supabase, workspaceId } = context
 *   // ... handler logic
 * })
 * ```
 */
export { withRLSContext, type RLSContext, type RLSRouteHandler } from './rls-context'

// Re-export error types for convenience
export {
  QueryError,
  RateLimitError,
  TimeoutError,
  InvalidQueryError,
  PostHogAPIError,
  ConfigurationError,
}
