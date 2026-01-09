import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryRepository } from './query-repository'
import type { PosthogQuery, PosthogQueryInsert } from '../types/posthog-query'

// Mock Supabase client
const createMockSupabase = () => {
  const mockSelect = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockEq = vi.fn()
  const mockGte = vi.fn()
  const mockOrder = vi.fn()
  const mockLimit = vi.fn()
  const mockSingle = vi.fn()

  const mockChain = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    eq: mockEq,
    gte: mockGte,
    order: mockOrder,
    limit: mockLimit,
    single: mockSingle,
  }

  // Chain returns self for fluent API
  Object.values(mockChain).forEach((fn) => {
    fn.mockReturnValue(mockChain)
  })

  const mockFrom = vi.fn().mockReturnValue(mockChain)

  return {
    from: mockFrom,
    _chain: mockChain,
    _mockSelect: mockSelect,
    _mockSingle: mockSingle,
    _mockInsert: mockInsert,
    _mockUpdate: mockUpdate,
    _mockEq: mockEq,
  }
}

describe('QueryRepository', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>
  let repository: QueryRepository

  const mockQuery: PosthogQuery = {
    id: 'query-123',
    workspace_id: 'workspace-456',
    query_text: 'SELECT * FROM events',
    query_hash: 'abc123hash',
    status: 'completed',
    execution_time_ms: 150,
    error_message: null,
    created_at: '2026-01-09T10:00:00Z',
    started_at: '2026-01-09T10:00:00Z',
    completed_at: '2026-01-09T10:00:01Z',
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository = new QueryRepository(mockSupabase as any)
  })

  describe('create', () => {
    it('creates a new query record', async () => {
      const insertData: PosthogQueryInsert = {
        workspace_id: 'workspace-456',
        query_text: 'SELECT * FROM events',
        query_hash: 'abc123hash',
      }

      mockSupabase._mockSingle.mockResolvedValue({
        data: mockQuery,
        error: null,
      })

      const result = await repository.create(insertData)

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_queries')
      expect(mockSupabase._mockInsert).toHaveBeenCalledWith(insertData)
      expect(result).toEqual(mockQuery)
    })

    it('throws error on create failure', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      })

      await expect(
        repository.create({
          workspace_id: 'workspace-456',
          query_text: 'SELECT *',
          query_hash: 'hash',
        })
      ).rejects.toThrow('Failed to create query: Insert failed')
    })
  })

  describe('getById', () => {
    it('returns query when found', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: mockQuery,
        error: null,
      })

      const result = await repository.getById('query-123')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_queries')
      expect(mockSupabase._mockEq).toHaveBeenCalledWith('id', 'query-123')
      expect(result).toEqual(mockQuery)
    })

    it('returns null when not found', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      })

      const result = await repository.getById('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('update', () => {
    it('updates query record', async () => {
      const updatedQuery = { ...mockQuery, status: 'running' as const }
      mockSupabase._mockSingle.mockResolvedValue({
        data: updatedQuery,
        error: null,
      })

      const result = await repository.update('query-123', { status: 'running' })

      expect(mockSupabase._mockUpdate).toHaveBeenCalledWith({ status: 'running' })
      expect(result.status).toBe('running')
    })
  })

  describe('updateStatus', () => {
    it('updates status to running with started_at', async () => {
      const runningQuery = { ...mockQuery, status: 'running' as const }
      mockSupabase._mockSingle.mockResolvedValue({
        data: runningQuery,
        error: null,
      })

      await repository.updateStatus('query-123', 'running')

      expect(mockSupabase._mockUpdate).toHaveBeenCalled()
      const updateCall = mockSupabase._mockUpdate.mock.calls[0][0]
      expect(updateCall.status).toBe('running')
      expect(updateCall.started_at).toBeDefined()
    })

    it('updates status to completed with completed_at and execution_time', async () => {
      const completedQuery = { ...mockQuery, status: 'completed' as const }
      mockSupabase._mockSingle.mockResolvedValue({
        data: completedQuery,
        error: null,
      })

      await repository.updateStatus('query-123', 'completed', {
        execution_time_ms: 200,
      })

      const updateCall = mockSupabase._mockUpdate.mock.calls[0][0]
      expect(updateCall.status).toBe('completed')
      expect(updateCall.completed_at).toBeDefined()
      expect(updateCall.execution_time_ms).toBe(200)
    })

    it('updates status to failed with error message', async () => {
      const failedQuery = { ...mockQuery, status: 'failed' as const }
      mockSupabase._mockSingle.mockResolvedValue({
        data: failedQuery,
        error: null,
      })

      await repository.updateStatus('query-123', 'failed', {
        error_message: 'Query timeout',
      })

      const updateCall = mockSupabase._mockUpdate.mock.calls[0][0]
      expect(updateCall.status).toBe('failed')
      expect(updateCall.error_message).toBe('Query timeout')
    })
  })

  describe('countQueriesInLastHour', () => {
    it('returns count of queries in last hour', async () => {
      // Override the chain for count query
      mockSupabase._chain.select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            count: 150,
            error: null,
          }),
        }),
      })

      const count = await repository.countQueriesInLastHour('workspace-456')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_queries')
      expect(count).toBe(150)
    })

    it('returns 0 when no queries found', async () => {
      mockSupabase._chain.select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gte: vi.fn().mockResolvedValue({
            count: null,
            error: null,
          }),
        }),
      })

      const count = await repository.countQueriesInLastHour('workspace-456')

      expect(count).toBe(0)
    })
  })
})
