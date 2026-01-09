/**
 * Error class exports for PostHog Query Execution
 */

export {
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
} from './query-errors'
