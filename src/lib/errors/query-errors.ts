/**
 * Query Execution Error Classes
 * Custom error types for query validation, rate limiting, and execution failures
 */

/**
 * Base class for all query-related errors
 */
export class QueryError extends Error {
  public readonly code: string
  public readonly retryable: boolean
  public readonly details?: Record<string, unknown>

  constructor(
    message: string,
    code: string,
    options?: {
      retryable?: boolean
      details?: Record<string, unknown>
    }
  ) {
    super(message)
    this.name = 'QueryError'
    this.code = code
    this.retryable = options?.retryable ?? false
    this.details = options?.details
  }

  /**
   * Convert to API response format
   */
  toJSON() {
    return {
      error: this.message,
      error_code: this.code,
      details: this.details,
      retryable: this.retryable,
    }
  }
}

/**
 * Rate limit exceeded error
 * Thrown when workspace exceeds 2,400 queries/hour
 */
export class RateLimitError extends QueryError {
  public readonly resetAt: Date
  public readonly limit: number
  public readonly remaining: number

  constructor(options: {
    resetAt: Date
    limit: number
    remaining: number
  }) {
    super(
      `Rate limit exceeded. Limit: ${options.limit} queries/hour. Resets at ${options.resetAt.toISOString()}`,
      'RATE_LIMIT_EXCEEDED',
      {
        retryable: true,
        details: {
          limit: options.limit,
          remaining: options.remaining,
          reset_at: options.resetAt.toISOString(),
        },
      }
    )
    this.name = 'RateLimitError'
    this.resetAt = options.resetAt
    this.limit = options.limit
    this.remaining = options.remaining
  }

  /**
   * Get seconds until rate limit resets
   */
  getRetryAfterSeconds(): number {
    return Math.max(0, Math.ceil((this.resetAt.getTime() - Date.now()) / 1000))
  }
}

/**
 * Query timeout error
 * Thrown when query execution exceeds the timeout limit
 */
export class TimeoutError extends QueryError {
  public readonly timeoutMs: number

  constructor(timeoutMs: number) {
    super(
      `Query execution timed out after ${timeoutMs}ms`,
      'QUERY_TIMEOUT',
      {
        retryable: true,
        details: { timeout_ms: timeoutMs },
      }
    )
    this.name = 'TimeoutError'
    this.timeoutMs = timeoutMs
  }
}

/**
 * Invalid query error
 * Thrown when query fails validation (syntax, security, etc.)
 */
export class InvalidQueryError extends QueryError {
  public readonly reason: string

  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      `Invalid query: ${reason}`,
      'INVALID_QUERY',
      {
        retryable: false,
        details: { reason, ...details },
      }
    )
    this.name = 'InvalidQueryError'
    this.reason = reason
  }
}

/**
 * PostHog API error
 * Thrown when PostHog API request fails
 */
export class PostHogAPIError extends QueryError {
  public readonly statusCode?: number
  public readonly posthogError?: string

  constructor(options: {
    message: string
    statusCode?: number
    posthogError?: string
    retryable?: boolean
  }) {
    const retryable = options.retryable ??
      (options.statusCode !== undefined &&
       (options.statusCode === 429 || options.statusCode >= 500))

    super(
      options.message,
      'POSTHOG_API_ERROR',
      {
        retryable,
        details: {
          status_code: options.statusCode,
          posthog_error: options.posthogError,
        },
      }
    )
    this.name = 'PostHogAPIError'
    this.statusCode = options.statusCode
    this.posthogError = options.posthogError
  }
}

/**
 * Configuration error
 * Thrown when PostHog is not configured for the workspace
 */
export class ConfigurationError extends QueryError {
  constructor(message: string) {
    super(
      message,
      'CONFIGURATION_ERROR',
      { retryable: false }
    )
    this.name = 'ConfigurationError'
  }
}

/**
 * Type guard for QueryError
 */
export function isQueryError(error: unknown): error is QueryError {
  return error instanceof QueryError
}

/**
 * Type guard for RateLimitError
 */
export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError
}

/**
 * Type guard for TimeoutError
 */
export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError
}

/**
 * Type guard for InvalidQueryError
 */
export function isInvalidQueryError(error: unknown): error is InvalidQueryError {
  return error instanceof InvalidQueryError
}

/**
 * Type guard for PostHogAPIError
 */
export function isPostHogAPIError(error: unknown): error is PostHogAPIError {
  return error instanceof PostHogAPIError
}
