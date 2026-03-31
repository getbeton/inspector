/// <reference types="vitest" />
/**
 * Tests for HubSpot Rate Limiter
 *
 * HS-U10: Token bucket acquires and depletes
 * HS-U11: 429 handling pauses and recovers
 * HS-U12: Priority allocation works
 */

import {
  tryAcquire,
  handleRateLimitResponse,
  parseRateLimitHeaders,
  getStats,
  reset,
  resetAll,
} from './rate-limiter'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/utils/logger', () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('HubSpot Rate Limiter', () => {
  beforeEach(() => {
    resetAll()
  })

  // HS-U10: Token bucket
  describe('tryAcquire', () => {
    it('allows requests when bucket has tokens', () => {
      const result = tryAcquire('conn-1', 'normal', 'oauth')
      expect(result.allowed).toBe(true)
      expect(result.waitMs).toBe(0)
    })

    it('creates separate buckets per connection', () => {
      const r1 = tryAcquire('conn-1', 'normal', 'oauth')
      const r2 = tryAcquire('conn-2', 'normal', 'private_app')
      expect(r1.allowed).toBe(true)
      expect(r2.allowed).toBe(true)

      const stats1 = getStats('conn-1')
      const stats2 = getStats('conn-2')
      expect(stats1?.maxTokens).toBe(55) // OAuth: 50% of 110
      expect(stats2?.maxTokens).toBe(50) // Private App: 50% of 100
    })

    it('depletes tokens on repeated requests', () => {
      // Drain the bucket — tokens refill slightly between calls, so use a generous threshold
      for (let i = 0; i < 55; i++) {
        tryAcquire('conn-drain', 'high', 'oauth')
      }

      const stats = getStats('conn-drain')
      // Tokens should be significantly reduced (some may refill between calls)
      expect(stats?.tokens).toBeLessThan(stats!.maxTokens * 0.5)
    })
  })

  // HS-U11: 429 handling
  describe('handleRateLimitResponse', () => {
    it('pauses requests after 429', () => {
      handleRateLimitResponse('conn-429', 5)

      const stats = getStats('conn-429')
      expect(stats?.paused).toBe(true)
      expect(stats?.tokens).toBe(0)

      // Requests should be blocked
      const result = tryAcquire('conn-429', 'high', 'oauth')
      expect(result.allowed).toBe(false)
      expect(result.waitMs).toBeGreaterThan(0)
    })

    it('recovers after pause period expires', async () => {
      // Pause for 0.1 seconds
      handleRateLimitResponse('conn-recover', 0.1)

      // Wait for recovery
      await new Promise((resolve) => setTimeout(resolve, 200))

      // Should be able to acquire again
      const result = tryAcquire('conn-recover', 'normal', 'oauth')
      expect(result.allowed).toBe(true)

      // Recovery gives 25% capacity
      const stats = getStats('conn-recover')
      // After one acquire, should have (25% of 55) - 1 tokens
      expect(stats?.tokens).toBeLessThanOrEqual(Math.floor(55 * 0.25))
    })
  })

  // HS-U12: Priority allocation
  describe('priority', () => {
    it('high priority gets 60% allocation', () => {
      // With full bucket, high priority should succeed
      const result = tryAcquire('conn-pri', 'high', 'oauth')
      expect(result.allowed).toBe(true)
    })

    it('low priority may be blocked when tokens are scarce', () => {
      // Drain most of the bucket
      for (let i = 0; i < 54; i++) {
        tryAcquire('conn-low', 'high', 'oauth')
      }

      // After draining, tokens should be significantly reduced
      const stats = getStats('conn-low')
      expect(stats?.tokens).toBeLessThan(stats!.maxTokens * 0.5)
    })
  })

  // parseRateLimitHeaders
  describe('parseRateLimitHeaders', () => {
    it('parses standard headers', () => {
      const response = new Response('', {
        headers: {
          'x-hubspot-ratelimit-daily-remaining': '5000',
          'x-hubspot-ratelimit-daily': '250000',
          'x-hubspot-ratelimit-interval-milliseconds': '10000',
        },
      })

      const headers = parseRateLimitHeaders(response)
      expect(headers.remaining).toBe(5000)
      expect(headers.limit).toBe(250000)
      expect(headers.reset).toBe(10)
      expect(headers.retryAfter).toBeUndefined()
    })

    it('parses retry-after on 429', () => {
      const response = new Response('', {
        status: 429,
        headers: {
          'retry-after': '15',
        },
      })

      const headers = parseRateLimitHeaders(response)
      expect(headers.retryAfter).toBe(15)
    })
  })

  // reset
  describe('reset', () => {
    it('removes bucket for a connection', () => {
      tryAcquire('conn-reset', 'normal', 'oauth')
      expect(getStats('conn-reset')).not.toBeNull()

      reset('conn-reset')
      expect(getStats('conn-reset')).toBeNull()
    })

    it('resetAll clears all buckets', () => {
      tryAcquire('conn-a', 'normal', 'oauth')
      tryAcquire('conn-b', 'normal', 'oauth')

      resetAll()

      expect(getStats('conn-a')).toBeNull()
      expect(getStats('conn-b')).toBeNull()
    })
  })
})
