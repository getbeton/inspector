/**
 * HubSpot Rate Limiter
 *
 * Token bucket algorithm per connection with priority queue support.
 * Conservative: operates at 50% of HubSpot's published capacity.
 *
 * HubSpot limits:
 *   - OAuth: 110 requests per 10 seconds
 *   - Private App (free): 100 requests per 10 seconds
 *   - 429 responses include Retry-After header
 *
 * Priority levels:
 *   - high (60%): user-initiated actions (UI clicks, searches)
 *   - normal (30%): scheduled sync operations
 *   - low (10%): backfill and background tasks
 */

import type { RateLimitPriority, RateLimitHeaders } from './types'
import { RATE_LIMITS } from './config'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot Rate Limiter]')

// ============================================
// Token Bucket
// ============================================

interface TokenBucket {
  tokens: number
  maxTokens: number
  refillRate: number // tokens per second
  lastRefill: number // timestamp ms
  paused: boolean
  pausedUntil: number // timestamp ms
}

/** Priority allocation percentages */
const PRIORITY_ALLOCATION: Record<RateLimitPriority, number> = {
  high: 0.6,
  normal: 0.3,
  low: 0.1,
}

/** Active token buckets per connection ID */
const buckets = new Map<string, TokenBucket>()

/**
 * Get or create a token bucket for a connection.
 *
 * @param connectionId - Unique connection identifier
 * @param authType - 'oauth' or 'private_app' (determines capacity)
 * @returns The connection's token bucket
 */
function getBucket(connectionId: string, authType: 'oauth' | 'private_app' = 'oauth'): TokenBucket {
  let bucket = buckets.get(connectionId)

  if (!bucket) {
    const maxTokens =
      authType === 'oauth'
        ? RATE_LIMITS.OAUTH_TOKENS_PER_10S
        : RATE_LIMITS.PRIVATE_APP_TOKENS_PER_10S

    bucket = {
      tokens: maxTokens,
      maxTokens,
      refillRate: maxTokens / 10, // tokens per second (capacity per 10s / 10)
      lastRefill: Date.now(),
      paused: false,
      pausedUntil: 0,
    }
    buckets.set(connectionId, bucket)
  }

  return bucket
}

/**
 * Refill tokens based on elapsed time.
 */
function refillTokens(bucket: TokenBucket): void {
  const now = Date.now()
  const elapsed = (now - bucket.lastRefill) / 1000 // seconds
  const tokensToAdd = elapsed * bucket.refillRate

  bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd)
  bucket.lastRefill = now
}

/**
 * Check if a request can proceed, consuming a token if allowed.
 *
 * @param connectionId - Connection identifier
 * @param priority - Request priority level
 * @param authType - Auth type for capacity calculation
 * @returns Object with allowed flag and wait time in ms if not allowed
 */
export function tryAcquire(
  connectionId: string,
  priority: RateLimitPriority = 'normal',
  authType: 'oauth' | 'private_app' = 'oauth'
): { allowed: boolean; waitMs: number } {
  const bucket = getBucket(connectionId, authType)

  // Check if paused (429 recovery)
  if (bucket.paused && Date.now() < bucket.pausedUntil) {
    return {
      allowed: false,
      waitMs: bucket.pausedUntil - Date.now(),
    }
  }

  // Unpause if time has passed
  if (bucket.paused && Date.now() >= bucket.pausedUntil) {
    bucket.paused = false
    // Gradual recovery: start with 25% capacity
    bucket.tokens = Math.floor(bucket.maxTokens * 0.25)
    log.info(`Rate limiter recovered for connection ${connectionId}`)
  }

  // Refill tokens
  refillTokens(bucket)

  // Check priority allocation
  const allocatedTokens = bucket.maxTokens * PRIORITY_ALLOCATION[priority]
  const minimumRequired = Math.max(1, Math.floor(allocatedTokens * 0.1))

  if (bucket.tokens < minimumRequired) {
    // Not enough tokens for this priority level
    const waitMs = Math.ceil((minimumRequired - bucket.tokens) / bucket.refillRate * 1000)
    return { allowed: false, waitMs }
  }

  // Consume a token
  bucket.tokens -= 1
  return { allowed: true, waitMs: 0 }
}

/**
 * Wait for a token to become available, then acquire it.
 * Respects priority levels and paused state.
 *
 * @param connectionId - Connection identifier
 * @param priority - Request priority level
 * @param authType - Auth type for capacity calculation
 * @param maxWaitMs - Maximum time to wait (default: 30s)
 * @returns Promise that resolves when a token is acquired
 * @throws Error if max wait time exceeded
 */
export async function acquire(
  connectionId: string,
  priority: RateLimitPriority = 'normal',
  authType: 'oauth' | 'private_app' = 'oauth',
  maxWaitMs: number = 30_000
): Promise<void> {
  const startTime = Date.now()

  while (true) {
    const result = tryAcquire(connectionId, priority, authType)

    if (result.allowed) {
      return
    }

    // Check if we'd exceed max wait
    if (Date.now() - startTime + result.waitMs > maxWaitMs) {
      throw new Error(
        `Rate limit: waited ${Date.now() - startTime}ms, need ${result.waitMs}ms more (max: ${maxWaitMs}ms)`
      )
    }

    // Wait and retry
    await new Promise((resolve) => setTimeout(resolve, Math.min(result.waitMs, 1000)))
  }
}

/**
 * Handle a 429 response from HubSpot.
 * Pauses all requests for this connection until Retry-After expires.
 *
 * @param connectionId - Connection identifier
 * @param retryAfterSeconds - Retry-After header value (seconds)
 */
export function handleRateLimitResponse(
  connectionId: string,
  retryAfterSeconds: number
): void {
  const bucket = getBucket(connectionId)
  bucket.paused = true
  bucket.pausedUntil = Date.now() + retryAfterSeconds * 1000
  bucket.tokens = 0

  log.warn(
    `Rate limited on connection ${connectionId}, pausing for ${retryAfterSeconds}s`
  )
}

/**
 * Update rate limit state based on HubSpot response headers.
 * Dynamically adjusts capacity based on observed limits.
 *
 * @param connectionId - Connection identifier
 * @param headers - Parsed rate limit headers from HubSpot response
 */
export function updateFromHeaders(
  connectionId: string,
  headers: RateLimitHeaders
): void {
  const bucket = getBucket(connectionId)

  // If HubSpot tells us we have very few remaining requests, slow down
  if (headers.remaining < 5) {
    log.warn(
      `Low remaining requests (${headers.remaining}/${headers.limit}) for connection ${connectionId}`
    )
    // Reduce available tokens to match remaining
    bucket.tokens = Math.min(bucket.tokens, headers.remaining)
  }

  // Handle 429 Retry-After
  if (headers.retryAfter !== undefined) {
    handleRateLimitResponse(connectionId, headers.retryAfter)
  }
}

/**
 * Parse rate limit headers from a HubSpot API response.
 *
 * @param response - Fetch Response object
 * @returns Parsed rate limit headers
 */
export function parseRateLimitHeaders(response: Response): RateLimitHeaders {
  return {
    remaining: parseInt(response.headers.get('x-hubspot-ratelimit-daily-remaining') || '1000', 10),
    limit: parseInt(response.headers.get('x-hubspot-ratelimit-daily') || '250000', 10),
    reset: parseInt(response.headers.get('x-hubspot-ratelimit-interval-milliseconds') || '10000', 10) / 1000,
    retryAfter: response.status === 429
      ? parseInt(response.headers.get('retry-after') || '10', 10)
      : undefined,
  }
}

/**
 * Get current rate limiter stats for a connection (for monitoring/debugging).
 */
export function getStats(connectionId: string): {
  tokens: number
  maxTokens: number
  paused: boolean
  pausedUntil: number
} | null {
  const bucket = buckets.get(connectionId)
  if (!bucket) return null

  refillTokens(bucket)
  return {
    tokens: Math.floor(bucket.tokens),
    maxTokens: bucket.maxTokens,
    paused: bucket.paused,
    pausedUntil: bucket.pausedUntil,
  }
}

/**
 * Reset rate limiter for a connection (useful for testing or reconnection).
 */
export function reset(connectionId: string): void {
  buckets.delete(connectionId)
}

/**
 * Reset all rate limiters (useful for testing).
 */
export function resetAll(): void {
  buckets.clear()
}
