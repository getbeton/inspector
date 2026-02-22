import { describe, it, expect, vi } from 'vitest'
import { withRetry, withRetryBatch } from './retry'

describe('withRetry', () => {
  it('returns data on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await withRetry(fn)

    expect(result).toEqual({ success: true, data: 'ok', attempts: 1 })
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries on failure and succeeds', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { initialDelayMs: 1 })

    expect(result).toEqual({ success: true, data: 'ok', attempts: 2 })
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('returns failure after max retries exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))

    const result = await withRetry(fn, { maxRetries: 2, initialDelayMs: 1 })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.attempts).toBe(3) // 1 initial + 2 retries
      expect(result.error.message).toContain('Failed after 3 attempt(s)')
    }
  })

  it('stops retrying when isRetryable returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('401 unauthorized'))

    const result = await withRetry(fn, {
      maxRetries: 5,
      initialDelayMs: 1,
      // default isRetryable skips auth errors
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.attempts).toBe(1) // no retries for auth errors
    }
  })

  it('calls onRetry callback with attempt info', async () => {
    const onRetry = vi.fn()
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue('ok')

    await withRetry(fn, { initialDelayMs: 1, onRetry })

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number))
  })

  it('uses custom isRetryable predicate', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('retry me'))
      .mockRejectedValueOnce(new Error('do not retry'))
      .mockResolvedValue('ok')

    const result = await withRetry(fn, {
      maxRetries: 5,
      initialDelayMs: 1,
      isRetryable: (err) => err instanceof Error && err.message === 'retry me',
    })

    expect(result.success).toBe(false)
    expect(fn).toHaveBeenCalledTimes(2) // retried once, then stopped
  })

  it('retries rate limit errors by default', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('rate limit exceeded'))
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { initialDelayMs: 1 })

    expect(result).toEqual({ success: true, data: 'ok', attempts: 2 })
  })

  it('retries 503 errors by default', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('503 service unavailable'))
      .mockResolvedValue('ok')

    const result = await withRetry(fn, { initialDelayMs: 1 })

    expect(result).toEqual({ success: true, data: 'ok', attempts: 2 })
  })
})

describe('withRetryBatch', () => {
  it('processes all items in batches', async () => {
    const items = [1, 2, 3, 4, 5]
    const fn = vi.fn(async (n: number) => n * 2)

    const results = await withRetryBatch(items, fn, { batchSize: 2 })

    expect(results).toHaveLength(5)
    expect(results.every((r) => r.success)).toBe(true)
    expect(results.map((r) => r.success && r.data)).toEqual([2, 4, 6, 8, 10])
  })

  it('retries individual failures within a batch', async () => {
    const items = ['a', 'b']
    let callCount = 0
    const fn = vi.fn(async (s: string) => {
      callCount++
      if (s === 'a' && callCount === 1) throw new Error('network error')
      return s.toUpperCase()
    })

    const results = await withRetryBatch(items, fn, {
      batchSize: 10,
      initialDelayMs: 1,
    })

    expect(results.every((r) => r.success)).toBe(true)
  })
})
