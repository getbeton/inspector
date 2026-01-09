import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RateLimiter, RATE_LIMIT_CONFIG } from './rate-limiter'
import { RateLimitError } from '../errors/query-errors'

// Mock Supabase client
const createMockSupabase = () => {
  const mockSelect = vi.fn()
  const mockEq = vi.fn()
  const mockGte = vi.fn()

  const mockChain = {
    select: mockSelect,
    eq: mockEq,
    gte: mockGte,
  }

  Object.values(mockChain).forEach((fn) => {
    fn.mockReturnValue(mockChain)
  })

  const mockFrom = vi.fn().mockReturnValue(mockChain)

  return {
    from: mockFrom,
    _chain: mockChain,
  }
}

describe('RateLimiter', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>
  let rateLimiter: RateLimiter

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rateLimiter = new RateLimiter(mockSupabase as any)
  })

  describe('getRateLimitStatus', () => {
    it('returns status when under limit', async () => {
      mockSupabase._chain.gte.mockResolvedValue({
        count: 100,
        error: null,
      })

      const status = await rateLimiter.getRateLimitStatus('workspace-123')

      expect(status.used).toBe(100)
      expect(status.limit).toBe(RATE_LIMIT_CONFIG.QUERIES_PER_HOUR)
      expect(status.remaining).toBe(RATE_LIMIT_CONFIG.QUERIES_PER_HOUR - 100)
      expect(status.isLimited).toBe(false)
      expect(status.isWarning).toBe(false)
    })

    it('returns warning when approaching limit (>80%)', async () => {
      const warningCount = Math.ceil(RATE_LIMIT_CONFIG.QUERIES_PER_HOUR * 0.85)
      mockSupabase._chain.gte.mockResolvedValue({
        count: warningCount,
        error: null,
      })

      const status = await rateLimiter.getRateLimitStatus('workspace-123')

      expect(status.isWarning).toBe(true)
      expect(status.isLimited).toBe(false)
    })

    it('returns limited when at limit', async () => {
      mockSupabase._chain.gte.mockResolvedValue({
        count: RATE_LIMIT_CONFIG.QUERIES_PER_HOUR,
        error: null,
      })

      const status = await rateLimiter.getRateLimitStatus('workspace-123')

      expect(status.remaining).toBe(0)
      expect(status.isLimited).toBe(true)
    })

    it('returns limited when over limit', async () => {
      mockSupabase._chain.gte.mockResolvedValue({
        count: RATE_LIMIT_CONFIG.QUERIES_PER_HOUR + 100,
        error: null,
      })

      const status = await rateLimiter.getRateLimitStatus('workspace-123')

      expect(status.remaining).toBe(0)
      expect(status.isLimited).toBe(true)
    })
  })

  describe('checkRateLimit', () => {
    it('returns status when under limit', async () => {
      mockSupabase._chain.gte.mockResolvedValue({
        count: 100,
        error: null,
      })

      const status = await rateLimiter.checkRateLimit('workspace-123')

      expect(status.isLimited).toBe(false)
    })

    it('throws RateLimitError when limit exceeded', async () => {
      mockSupabase._chain.gte.mockResolvedValue({
        count: RATE_LIMIT_CONFIG.QUERIES_PER_HOUR + 1,
        error: null,
      })

      await expect(rateLimiter.checkRateLimit('workspace-123')).rejects.toThrow(
        RateLimitError
      )
    })

    it('logs warning when approaching limit', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const warningCount = Math.ceil(RATE_LIMIT_CONFIG.QUERIES_PER_HOUR * 0.85)

      mockSupabase._chain.gte.mockResolvedValue({
        count: warningCount,
        error: null,
      })

      await rateLimiter.checkRateLimit('workspace-123')

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[RateLimiter]')
      )
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('workspace-123')
      )

      consoleSpy.mockRestore()
    })
  })

  describe('getRemainingQuota', () => {
    it('returns remaining quota', async () => {
      mockSupabase._chain.gte.mockResolvedValue({
        count: 500,
        error: null,
      })

      const remaining = await rateLimiter.getRemainingQuota('workspace-123')

      expect(remaining).toBe(RATE_LIMIT_CONFIG.QUERIES_PER_HOUR - 500)
    })

    it('returns 0 when limit exceeded', async () => {
      mockSupabase._chain.gte.mockResolvedValue({
        count: RATE_LIMIT_CONFIG.QUERIES_PER_HOUR + 100,
        error: null,
      })

      const remaining = await rateLimiter.getRemainingQuota('workspace-123')

      expect(remaining).toBe(0)
    })
  })

  describe('custom configuration', () => {
    it('uses custom queries per hour', async () => {
      const customLimit = 100
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const customRateLimiter = new RateLimiter(mockSupabase as any, {
        queriesPerHour: customLimit,
      })

      mockSupabase._chain.gte.mockResolvedValue({
        count: 50,
        error: null,
      })

      const status = await customRateLimiter.getRateLimitStatus('workspace-123')

      expect(status.limit).toBe(customLimit)
      expect(status.remaining).toBe(50)
    })
  })

  describe('error handling', () => {
    it('returns 0 count on database error (fail-open)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockSupabase._chain.gte.mockResolvedValue({
        count: null,
        error: { message: 'Database error' },
      })

      const status = await rateLimiter.getRateLimitStatus('workspace-123')

      // Should fail-open (allow requests on error)
      expect(status.used).toBe(0)
      expect(status.isLimited).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('getRetryAfterSeconds', () => {
    it('returns positive number of seconds', () => {
      const seconds = rateLimiter.getRetryAfterSeconds()
      expect(seconds).toBeGreaterThanOrEqual(0)
      expect(seconds).toBeLessThanOrEqual(3600)
    })
  })
})
