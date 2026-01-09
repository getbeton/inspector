import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResultRepository } from './result-repository'
import type { PosthogQueryResult, PosthogQueryResultInsert } from '../types/posthog-query'

// Mock Supabase client
const createMockSupabase = () => {
  const mockChain: Record<string, ReturnType<typeof vi.fn>> = {}

  const chainMethods = [
    'select',
    'insert',
    'delete',
    'eq',
    'or',
    'lt',
    'not',
    'order',
    'limit',
    'single',
  ]

  chainMethods.forEach((method) => {
    mockChain[method] = vi.fn()
  })

  // Chain returns self for fluent API
  Object.values(mockChain).forEach((fn) => {
    fn.mockReturnValue(mockChain)
  })

  const mockFrom = vi.fn().mockReturnValue(mockChain)

  return {
    from: mockFrom,
    _chain: mockChain,
  }
}

describe('ResultRepository', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>
  let repository: ResultRepository

  const mockResult: PosthogQueryResult = {
    id: 'result-123',
    workspace_id: 'workspace-456',
    query_id: 'query-789',
    query_hash: 'hash123',
    columns: ['event', 'count'],
    results: [['$pageview', 1000], ['$click', 500]],
    row_count: 2,
    cached_at: '2026-01-09T10:00:00Z',
    expires_at: null,
    created_at: '2026-01-09T10:00:00Z',
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository = new ResultRepository(mockSupabase as any)
  })

  describe('create', () => {
    it('creates a new result record', async () => {
      const insertData: PosthogQueryResultInsert = {
        workspace_id: 'workspace-456',
        query_id: 'query-789',
        query_hash: 'hash123',
        columns: ['event', 'count'],
        results: [['$pageview', 1000]],
        row_count: 1,
      }

      mockSupabase._chain.single.mockResolvedValue({
        data: mockResult,
        error: null,
      })

      const result = await repository.create(insertData)

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_query_results')
      expect(mockSupabase._chain.insert).toHaveBeenCalledWith(insertData)
      expect(result).toEqual(mockResult)
    })

    it('throws error on create failure', async () => {
      mockSupabase._chain.single.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      })

      await expect(
        repository.create({
          workspace_id: 'workspace-456',
          query_id: 'query-789',
          query_hash: 'hash',
          columns: [],
          results: [],
          row_count: 0,
        })
      ).rejects.toThrow('Failed to create result: Insert failed')
    })
  })

  describe('getByQueryId', () => {
    it('returns result when found', async () => {
      mockSupabase._chain.single.mockResolvedValue({
        data: mockResult,
        error: null,
      })

      const result = await repository.getByQueryId('query-789')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_query_results')
      expect(mockSupabase._chain.eq).toHaveBeenCalledWith('query_id', 'query-789')
      expect(result).toEqual(mockResult)
    })

    it('returns null when not found', async () => {
      mockSupabase._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      })

      const result = await repository.getByQueryId('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getCached', () => {
    it('returns cached result by hash (cache hit)', async () => {
      mockSupabase._chain.single.mockResolvedValue({
        data: mockResult,
        error: null,
      })

      const result = await repository.getCached('workspace-456', 'hash123')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_query_results')
      expect(mockSupabase._chain.eq).toHaveBeenCalledWith('workspace_id', 'workspace-456')
      expect(mockSupabase._chain.eq).toHaveBeenCalledWith('query_hash', 'hash123')
      expect(result).toEqual(mockResult)
    })

    it('returns null for cache miss', async () => {
      mockSupabase._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      })

      const result = await repository.getCached('workspace-456', 'nonexistent-hash')

      expect(result).toBeNull()
    })

    it('applies expiration filter', async () => {
      mockSupabase._chain.single.mockResolvedValue({
        data: mockResult,
        error: null,
      })

      await repository.getCached('workspace-456', 'hash123')

      // Should call or() for expiration check
      expect(mockSupabase._chain.or).toHaveBeenCalled()
    })
  })

  describe('isCached', () => {
    it('returns true when cached result exists', async () => {
      mockSupabase._chain.or.mockResolvedValue({
        count: 1,
        error: null,
      })

      const result = await repository.isCached('workspace-456', 'hash123')

      expect(result).toBe(true)
    })

    it('returns false when not cached', async () => {
      mockSupabase._chain.or.mockResolvedValue({
        count: 0,
        error: null,
      })

      const result = await repository.isCached('workspace-456', 'hash123')

      expect(result).toBe(false)
    })
  })

  describe('deleteExpired', () => {
    it('deletes expired cache entries', async () => {
      mockSupabase._chain.select.mockResolvedValue({
        data: [mockResult],
        error: null,
      })

      const count = await repository.deleteExpired('workspace-456')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_query_results')
      expect(mockSupabase._chain.delete).toHaveBeenCalled()
      expect(mockSupabase._chain.lt).toHaveBeenCalled() // expires_at < now
      expect(count).toBe(1)
    })

    it('returns 0 when no expired entries', async () => {
      mockSupabase._chain.select.mockResolvedValue({
        data: [],
        error: null,
      })

      const count = await repository.deleteExpired('workspace-456')

      expect(count).toBe(0)
    })
  })
})
