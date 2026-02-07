/**
 * API Rate Limiting Utility
 *
 * Provides in-memory rate limiting for API endpoints.
 * Uses a sliding window algorithm with configurable limits.
 *
 * Note: In-memory rate limiting is reset on server restart.
 * For production with multiple replicas, consider using Redis.
 */

import { NextResponse } from 'next/server'

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests in the window */
  limit: number
  /** Window duration in seconds */
  windowSeconds: number
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  resetAt: Date
}

/**
 * Internal storage for rate limit tracking
 */
interface RateLimitEntry {
  count: number
  resetAt: number
}

/**
 * In-memory store for rate limits
 * Key format: `${identifier}:${namespace}`
 */
const rateLimitStore = new Map<string, RateLimitEntry>()

/**
 * Clean up expired entries periodically (every 5 minutes)
 */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000
let cleanupScheduled = false

function scheduleCleanup(): void {
  if (cleanupScheduled) return
  cleanupScheduled = true

  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetAt < now) {
        rateLimitStore.delete(key)
      }
    }
  }, CLEANUP_INTERVAL_MS)
}

/**
 * Check rate limit for a given identifier and namespace
 *
 * @param identifier - Unique identifier (e.g., IP address, user ID)
 * @param namespace - Rate limit namespace (e.g., 'posthog-validate')
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export function checkRateLimit(
  identifier: string,
  namespace: string,
  config: RateLimitConfig
): RateLimitResult {
  scheduleCleanup()

  const key = `${identifier}:${namespace}`
  const now = Date.now()
  const windowMs = config.windowSeconds * 1000

  let entry = rateLimitStore.get(key)

  // Create or reset entry if window expired
  if (!entry || entry.resetAt < now) {
    entry = {
      count: 0,
      resetAt: now + windowMs,
    }
    rateLimitStore.set(key, entry)
  }

  // Increment counter
  entry.count++

  const remaining = Math.max(0, config.limit - entry.count)
  const success = entry.count <= config.limit

  return {
    success,
    limit: config.limit,
    remaining,
    resetAt: new Date(entry.resetAt),
  }
}

/**
 * Get client IP from request headers
 *
 * Checks common headers in order of priority:
 * 1. x-forwarded-for (most common for proxied requests)
 * 2. x-real-ip (nginx default)
 * 3. cf-connecting-ip (Cloudflare)
 */
export function getClientIp(request: Request): string {
  const headers = request.headers

  // Check x-forwarded-for first (comma-separated, first is client)
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const ips = forwardedFor.split(',')
    return ips[0].trim()
  }

  // Check x-real-ip
  const realIp = headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  // Check Cloudflare header
  const cfIp = headers.get('cf-connecting-ip')
  if (cfIp) {
    return cfIp.trim()
  }

  // Fallback to unknown
  return 'unknown'
}

/**
 * Default rate limit configurations for common use cases
 */
export const RATE_LIMITS = {
  /**
   * Validation endpoints (credential validation)
   * 10 requests per minute - prevents credential stuffing
   */
  VALIDATION: {
    limit: 10,
    windowSeconds: 60,
  } as RateLimitConfig,

  /**
   * MTU calculation endpoint
   * 30 requests per minute - more generous for legitimate usage
   */
  MTU_CALCULATION: {
    limit: 30,
    windowSeconds: 60,
  } as RateLimitConfig,

  /**
   * Strict rate limit for sensitive operations
   * 5 requests per minute
   */
  STRICT: {
    limit: 5,
    windowSeconds: 60,
  } as RateLimitConfig,

  /**
   * Webhook endpoint rate limit
   * 200 requests per minute per IP - generous to allow Stripe retry bursts
   * while protecting against abuse if signing secret is compromised
   */
  WEBHOOK: {
    limit: 200,
    windowSeconds: 60,
  } as RateLimitConfig,
} as const

/**
 * Create a rate limit error response
 */
export function rateLimitErrorResponse(result: RateLimitResult): NextResponse {
  const retryAfterSeconds = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)

  return NextResponse.json(
    {
      success: false,
      error: {
        code: 'rate_limited',
        message: `Too many requests. Please try again in ${retryAfterSeconds} seconds.`,
      },
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(Math.floor(result.resetAt.getTime() / 1000)),
      },
    }
  )
}

/**
 * Apply rate limiting to an API route
 *
 * @param request - The incoming request
 * @param namespace - Rate limit namespace (unique per endpoint type)
 * @param config - Rate limit configuration (defaults to VALIDATION)
 * @returns null if allowed, or a 429 response if rate limited
 *
 * @example
 * ```ts
 * export async function POST(request: Request) {
 *   const rateLimitResponse = applyRateLimit(request, 'posthog-validate')
 *   if (rateLimitResponse) return rateLimitResponse
 *
 *   // Continue with normal handler logic
 * }
 * ```
 */
export function applyRateLimit(
  request: Request,
  namespace: string,
  config: RateLimitConfig = RATE_LIMITS.VALIDATION
): NextResponse | null {
  const clientIp = getClientIp(request)
  const result = checkRateLimit(clientIp, namespace, config)

  if (!result.success) {
    return rateLimitErrorResponse(result)
  }

  return null
}
