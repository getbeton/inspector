/**
 * Query error classes — copied from src/lib/errors/query-errors.ts
 */

export class QueryError extends Error {
  public readonly code: string
  public readonly retryable: boolean
  public readonly details?: Record<string, unknown>

  constructor(message: string, code: string, options?: { retryable?: boolean; details?: Record<string, unknown> }) {
    super(message)
    this.name = 'QueryError'
    this.code = code
    this.retryable = options?.retryable ?? false
    this.details = options?.details
  }
}

export class TimeoutError extends QueryError {
  public readonly timeoutMs: number
  constructor(timeoutMs: number) {
    super(`Query execution timed out after ${timeoutMs}ms`, 'QUERY_TIMEOUT', { retryable: true, details: { timeout_ms: timeoutMs } })
    this.name = 'TimeoutError'
    this.timeoutMs = timeoutMs
  }
}

export class PostHogAPIError extends QueryError {
  public readonly statusCode?: number
  public readonly posthogError?: string
  constructor(options: { message: string; statusCode?: number; posthogError?: string; retryable?: boolean }) {
    const retryable = options.retryable ?? (options.statusCode !== undefined && (options.statusCode === 429 || options.statusCode >= 500))
    super(options.message, 'POSTHOG_API_ERROR', { retryable, details: { status_code: options.statusCode, posthog_error: options.posthogError } })
    this.name = 'PostHogAPIError'
    this.statusCode = options.statusCode
    this.posthogError = options.posthogError
  }
}

export class ConfigurationError extends QueryError {
  constructor(message: string) {
    super(message, 'CONFIGURATION_ERROR', { retryable: false })
    this.name = 'ConfigurationError'
  }
}
