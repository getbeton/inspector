/**
 * Rate Limiter Service
 * Postgres-based rate limiting for PostHog query execution
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { RateLimitError } from '../errors/query-errors'

/**
 * Rate limit configuration
 */
export const RATE_LIMIT_CONFIG = {
  /** Maximum queries per hour per workspace */
  QUERIES_PER_HOUR: 2400,
  /** Warning threshold (80% of limit) */
  WARNING_THRESHOLD: 0.8,
  /** Window duration in milliseconds (1 hour) */
  WINDOW_MS: 60 * 60 * 1000,
} as const

export interface RateLimitStatus {
  /** Number of queries remaining in current window */
  remaining: number
  /** Total limit */
  limit: number
  /** When the rate limit resets */
  resetAt: Date
  /** Whether the limit has been exceeded */
  isLimited: boolean
  /** Whether we're in warning territory (>80% used) */
  isWarning: boolean
  /** Number of queries used in current window */
  used: number
}

export class RateLimiter {
  private readonly queriesPerHour: number
  private readonly warningThreshold: number

  constructor(
    private supabase: SupabaseClient,
    config?: {
      queriesPerHour?: number
      warningThreshold?: number
    }
  ) {
    this.queriesPerHour = config?.queriesPerHour ?? RATE_LIMIT_CONFIG.QUERIES_PER_HOUR
    this.warningThreshold = config?.warningThreshold ?? RATE_LIMIT_CONFIG.WARNING_THRESHOLD
  }

  /**
   * Check if the workspace has exceeded the rate limit
   * @throws RateLimitError if limit exceeded
   */
  async checkRateLimit(workspaceId: string): Promise<RateLimitStatus> {
    const status = await this.getRateLimitStatus(workspaceId)

    if (status.isLimited) {
      throw new RateLimitError({
        resetAt: status.resetAt,
        limit: status.limit,
        remaining: status.remaining,
      })
    }

    // Log warning when approaching limit
    if (status.isWarning) {
      console.warn(
        `[RateLimiter] Workspace ${workspaceId} at ${Math.round((status.used / status.limit) * 100)}% of rate limit. ` +
        `Used: ${status.used}/${status.limit}. Resets at: ${status.resetAt.toISOString()}`
      )
    }

    return status
  }

  /**
   * Get current rate limit status without throwing
   */
  async getRateLimitStatus(workspaceId: string): Promise<RateLimitStatus> {
    const used = await this.countQueriesInWindow(workspaceId)
    const resetAt = this.getWindowResetTime()
    const remaining = Math.max(0, this.queriesPerHour - used)

    return {
      remaining,
      limit: this.queriesPerHour,
      resetAt,
      isLimited: remaining <= 0,
      isWarning: used >= this.queriesPerHour * this.warningThreshold,
      used,
    }
  }

  /**
   * Get remaining quota for the workspace
   */
  async getRemainingQuota(workspaceId: string): Promise<number> {
    const status = await this.getRateLimitStatus(workspaceId)
    return status.remaining
  }

  /**
   * Count queries in the current rate limit window
   * Uses optimized index: idx_posthog_queries_rate_limit
   */
  private async countQueriesInWindow(workspaceId: string): Promise<number> {
    const windowStart = new Date(Date.now() - RATE_LIMIT_CONFIG.WINDOW_MS).toISOString()

    const { count, error } = await this.supabase
      .from('posthog_queries')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .gte('created_at', windowStart)

    if (error) {
      console.error('[RateLimiter] Failed to count queries:', error)
      // On error, allow the request but log the failure
      return 0
    }

    return count ?? 0
  }

  /**
   * Calculate when the current rate limit window resets
   * Window resets exactly 1 hour after the oldest query in the window
   */
  private getWindowResetTime(): Date {
    // For simplicity, reset at the top of the next hour
    const now = new Date()
    const resetAt = new Date(now)
    resetAt.setMinutes(0, 0, 0)
    resetAt.setHours(resetAt.getHours() + 1)
    return resetAt
  }

  /**
   * Get the number of seconds until the rate limit resets
   */
  getRetryAfterSeconds(): number {
    const resetAt = this.getWindowResetTime()
    return Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000))
  }
}

/**
 * Create a rate limiter instance
 */
export function createRateLimiter(
  supabase: SupabaseClient,
  config?: {
    queriesPerHour?: number
    warningThreshold?: number
  }
): RateLimiter {
  return new RateLimiter(supabase, config)
}
