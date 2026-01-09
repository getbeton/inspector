import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { withErrorHandler } from './error-handler'
import {
  QueryError,
  RateLimitError,
  TimeoutError,
  InvalidQueryError,
  PostHogAPIError,
  ConfigurationError,
} from '@/lib/errors/query-errors'

// Create mock NextRequest
function createMockRequest(url = 'https://example.com/api/test') {
  return new NextRequest(url)
}

describe('withErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful requests', () => {
    it('passes through successful responses', async () => {
      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ data: 'test' }, { status: 200 })
      )

      const wrappedHandler = withErrorHandler(handler)
      const response = await wrappedHandler(createMockRequest())
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ data: 'test' })
    })

    it('passes request to handler', async () => {
      const handler = vi.fn().mockResolvedValue(NextResponse.json({}))
      const request = createMockRequest('https://example.com/api/query')

      await withErrorHandler(handler)(request)

      expect(handler).toHaveBeenCalledWith(request)
    })
  })

  describe('RateLimitError handling', () => {
    it('returns 429 status code', async () => {
      const resetAt = new Date(Date.now() + 3600000)
      const handler = vi.fn().mockRejectedValue(
        new RateLimitError({
          message: 'Rate limit exceeded',
          resetAt,
          limit: 2400,
          remaining: 0,
        })
      )

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.status).toBe(429)
    })

    it('includes Retry-After header', async () => {
      const resetAt = new Date(Date.now() + 3600000)
      const handler = vi.fn().mockRejectedValue(
        new RateLimitError({
          message: 'Rate limit exceeded',
          resetAt,
          limit: 2400,
          remaining: 0,
        })
      )

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.headers.get('Retry-After')).toBeTruthy()
      const retryAfter = parseInt(response.headers.get('Retry-After') || '0')
      expect(retryAfter).toBeGreaterThan(0)
      expect(retryAfter).toBeLessThanOrEqual(3600)
    })

    it('includes rate limit headers', async () => {
      const resetAt = new Date(Date.now() + 3600000)
      const handler = vi.fn().mockRejectedValue(
        new RateLimitError({
          message: 'Rate limit exceeded',
          resetAt,
          limit: 2400,
          remaining: 0,
        })
      )

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.headers.get('X-RateLimit-Limit')).toBe('2400')
      expect(response.headers.get('X-RateLimit-Remaining')).toBe('0')
      expect(response.headers.get('X-RateLimit-Reset')).toBeTruthy()
    })

    it('returns consistent error format', async () => {
      const resetAt = new Date(Date.now() + 3600000)
      const handler = vi.fn().mockRejectedValue(
        new RateLimitError({
          message: 'Rate limit exceeded',
          resetAt,
          limit: 2400,
          remaining: 0,
        })
      )

      const response = await withErrorHandler(handler)(createMockRequest())
      const body = await response.json()

      expect(body.error).toContain('Rate limit exceeded')
      expect(body.error_code).toBe('RATE_LIMIT_EXCEEDED')
      expect(typeof body.retryable).toBe('boolean')
    })
  })

  describe('InvalidQueryError handling', () => {
    it('returns 400 status code', async () => {
      const handler = vi.fn().mockRejectedValue(
        new InvalidQueryError('Query contains dangerous keywords')
      )

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.status).toBe(400)
    })

    it('returns consistent error format', async () => {
      const handler = vi.fn().mockRejectedValue(
        new InvalidQueryError('Query is too long')
      )

      const response = await withErrorHandler(handler)(createMockRequest())
      const body = await response.json()

      expect(body.error).toContain('Query is too long')
      expect(body.error_code).toBe('INVALID_QUERY')
      expect(body.retryable).toBe(false)
    })
  })

  describe('TimeoutError handling', () => {
    it('returns 504 status code', async () => {
      const handler = vi.fn().mockRejectedValue(new TimeoutError(60000))

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.status).toBe(504)
    })

    it('returns consistent error format', async () => {
      const handler = vi.fn().mockRejectedValue(new TimeoutError(60000))

      const response = await withErrorHandler(handler)(createMockRequest())
      const body = await response.json()

      expect(body).toMatchObject({
        error: expect.stringContaining('60000'),
        error_code: 'QUERY_TIMEOUT',
        retryable: true,
      })
    })
  })

  describe('PostHogAPIError handling', () => {
    it('returns PostHog status code when available', async () => {
      const handler = vi.fn().mockRejectedValue(
        new PostHogAPIError({
          message: 'Bad request',
          statusCode: 400,
        })
      )

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.status).toBe(400)
    })

    it('returns 502 when no status code', async () => {
      const handler = vi.fn().mockRejectedValue(
        new PostHogAPIError({
          message: 'Connection failed',
        })
      )

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.status).toBe(502)
    })

    it('returns consistent error format', async () => {
      const handler = vi.fn().mockRejectedValue(
        new PostHogAPIError({
          message: 'Invalid HogQL syntax',
          statusCode: 400,
          posthogError: 'Syntax error at line 1',
        })
      )

      const response = await withErrorHandler(handler)(createMockRequest())
      const body = await response.json()

      expect(body).toMatchObject({
        error: 'Invalid HogQL syntax',
        error_code: 'POSTHOG_API_ERROR',
      })
    })
  })

  describe('ConfigurationError handling', () => {
    it('returns 503 status code', async () => {
      const handler = vi.fn().mockRejectedValue(
        new ConfigurationError('PostHog API key not configured')
      )

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.status).toBe(503)
    })
  })

  describe('Generic QueryError handling', () => {
    it('returns 500 status code', async () => {
      const handler = vi.fn().mockRejectedValue(
        new QueryError({
          message: 'Unexpected error',
          code: 'UNKNOWN',
        })
      )

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.status).toBe(500)
    })
  })

  describe('Unknown error handling', () => {
    it('returns 500 for plain Error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Something broke'))

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.status).toBe(500)
    })

    it('returns consistent format for plain Error', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Something broke'))

      const response = await withErrorHandler(handler)(createMockRequest())
      const body = await response.json()

      expect(body).toMatchObject({
        error: 'Something broke',
        error_code: 'UNKNOWN_ERROR',
        retryable: true,
      })
    })

    it('returns 500 for non-Error throws', async () => {
      const handler = vi.fn().mockRejectedValue('string error')

      const response = await withErrorHandler(handler)(createMockRequest())

      expect(response.status).toBe(500)
    })

    it('returns generic message for non-Error throws', async () => {
      const handler = vi.fn().mockRejectedValue('string error')

      const response = await withErrorHandler(handler)(createMockRequest())
      const body = await response.json()

      expect(body.error).toBe('An unexpected error occurred')
      expect(body.error_code).toBe('UNKNOWN_ERROR')
    })
  })

  describe('logging', () => {
    it('logs unexpected errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const handler = vi.fn().mockRejectedValue(new Error('Unexpected'))

      await withErrorHandler(handler)(createMockRequest())

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorHandler]'),
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })

    it('warns for expected QueryError types', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const handler = vi.fn().mockRejectedValue(
        new InvalidQueryError('Bad query')
      )

      await withErrorHandler(handler)(createMockRequest())

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ErrorHandler]'),
        expect.stringContaining('Bad query'),
        expect.anything()
      )

      consoleSpy.mockRestore()
    })
  })

  describe('error response format consistency', () => {
    const errorCases = [
      {
        name: 'RateLimitError',
        error: new RateLimitError({
          message: 'Rate limit',
          resetAt: new Date(),
          limit: 100,
          remaining: 0,
        }),
      },
      {
        name: 'InvalidQueryError',
        error: new InvalidQueryError('Invalid'),
      },
      {
        name: 'TimeoutError',
        error: new TimeoutError(5000),
      },
      {
        name: 'PostHogAPIError',
        error: new PostHogAPIError({ message: 'API error' }),
      },
      {
        name: 'Plain Error',
        error: new Error('Plain error'),
      },
    ]

    errorCases.forEach(({ name, error }) => {
      it(`returns all required fields for ${name}`, async () => {
        const handler = vi.fn().mockRejectedValue(error)

        const response = await withErrorHandler(handler)(createMockRequest())
        const body = await response.json()

        expect(body).toHaveProperty('error')
        expect(body).toHaveProperty('error_code')
        expect(body).toHaveProperty('retryable')
        expect(typeof body.error).toBe('string')
        expect(typeof body.error_code).toBe('string')
        expect(typeof body.retryable).toBe('boolean')
      })
    })
  })
})
