/**
 * Retry Utility with Exponential Backoff
 *
 * Provides a reusable retry mechanism for transient failures in external API calls.
 * Used primarily in cron jobs and integrations (PostHog, Stripe, etc.).
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 10000) */
  maxDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier?: number;
  /** Optional function to determine if an error is retryable */
  isRetryable?: (error: unknown) => boolean;
  /** Optional callback for logging retry attempts */
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

export interface RetryResult<T> {
  success: true;
  data: T;
  attempts: number;
}

export interface RetryError {
  success: false;
  error: Error;
  attempts: number;
  lastError: unknown;
}

export type RetryOutcome<T> = RetryResult<T> | RetryError;

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'isRetryable' | 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Default function to determine if an error should be retried.
 * Retries on network errors and rate limits, but not on auth/validation errors.
 */
function defaultIsRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors - always retry
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up') ||
      message.includes('fetch failed')
    ) {
      return true;
    }

    // Rate limiting - retry with backoff
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return true;
    }

    // Server errors (5xx) - retry
    if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('504')) {
      return true;
    }

    // Auth errors - don't retry
    if (message.includes('unauthorized') || message.includes('forbidden') || message.includes('401') || message.includes('403')) {
      return false;
    }

    // Validation errors - don't retry
    if (message.includes('validation') || message.includes('invalid') || message.includes('400')) {
      return false;
    }
  }

  // Default to retrying unknown errors
  return true;
}

/**
 * Calculates the delay for a given attempt using exponential backoff with jitter.
 */
function calculateDelay(
  attempt: number,
  initialDelayMs: number,
  maxDelayMs: number,
  backoffMultiplier: number
): number {
  // Exponential backoff: initialDelay * multiplier^attempt
  const exponentialDelay = initialDelayMs * Math.pow(backoffMultiplier, attempt - 1);

  // Add jitter (0-25% random variation) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * Math.random();
  const delayWithJitter = exponentialDelay + jitter;

  // Cap at maxDelay
  return Math.min(delayWithJitter, maxDelayMs);
}

/**
 * Sleeps for the specified duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes an async function with retry logic and exponential backoff.
 *
 * @example
 * ```ts
 * const result = await withRetry(
 *   () => fetchFromPostHog(workspaceId),
 *   {
 *     maxRetries: 3,
 *     onRetry: (attempt, error, delay) => {
 *       console.log(`Retry ${attempt} after ${delay}ms: ${error}`);
 *     }
 *   }
 * );
 *
 * if (result.success) {
 *   console.log('Data:', result.data);
 * } else {
 *   console.error('All retries failed:', result.error);
 * }
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryOutcome<T>> {
  const {
    maxRetries = DEFAULT_OPTIONS.maxRetries,
    initialDelayMs = DEFAULT_OPTIONS.initialDelayMs,
    maxDelayMs = DEFAULT_OPTIONS.maxDelayMs,
    backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = options;

  let lastError: unknown;
  let attempts = 0;

  // Total attempts = 1 initial + maxRetries
  const totalAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    attempts = attempt;

    try {
      const result = await fn();
      return {
        success: true,
        data: result,
        attempts,
      };
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (attempt < totalAttempts && isRetryable(error)) {
        const delayMs = calculateDelay(attempt, initialDelayMs, maxDelayMs, backoffMultiplier);

        // Notify about retry
        if (onRetry) {
          onRetry(attempt, error, delayMs);
        }

        await sleep(delayMs);
      } else {
        // No more retries or non-retryable error
        break;
      }
    }
  }

  // All retries exhausted or non-retryable error
  const errorMessage =
    lastError instanceof Error
      ? lastError.message
      : 'Unknown error occurred';

  return {
    success: false,
    error: new Error(`Failed after ${attempts} attempt(s): ${errorMessage}`),
    attempts,
    lastError,
  };
}

/**
 * Executes multiple operations in parallel batches with retry logic.
 * Useful for processing many items while respecting rate limits.
 *
 * @example
 * ```ts
 * const results = await withRetryBatch(
 *   workspaces,
 *   (workspace) => processWorkspace(workspace.id),
 *   { batchSize: 10, maxRetries: 3 }
 * );
 *
 * const successes = results.filter(r => r.success);
 * const failures = results.filter(r => !r.success);
 * ```
 */
export async function withRetryBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  options: RetryOptions & { batchSize?: number } = {}
): Promise<Array<RetryOutcome<R> & { item: T }>> {
  const { batchSize = 10, ...retryOptions } = options;
  const results: Array<RetryOutcome<R> & { item: T }> = [];

  // Process in batches
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (item) => {
        const result = await withRetry(() => fn(item), retryOptions);
        return { ...result, item };
      })
    );

    results.push(...batchResults);
  }

  return results;
}
