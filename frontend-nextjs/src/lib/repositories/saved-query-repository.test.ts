import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SavedQueryRepository } from './saved-query-repository'
import type { PosthogSavedQuery, PosthogSavedQueryInsert } from '../types/posthog-query'

// Mock Supabase client
const createMockSupabase = () => {
  const mockSelect = vi.fn()
  const mockInsert = vi.fn()
  const mockUpdate = vi.fn()
  const mockDelete = vi.fn()
  const mockEq = vi.fn()
  const mockOrder = vi.fn()
  const mockSingle = vi.fn()

  const mockChain = {
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
    order: mockOrder,
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
    _mockDelete: mockDelete,
    _mockEq: mockEq,
  }
}

describe('SavedQueryRepository', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>
  let repository: SavedQueryRepository

  const mockSavedQuery: PosthogSavedQuery = {
    id: 'saved-query-123',
    workspace_id: 'workspace-456',
    posthog_query_id: null,
    name: 'My Query',
    description: 'A test query',
    query_text: 'SELECT * FROM events',
    is_active: true,
    created_at: '2026-01-09T10:00:00Z',
    updated_at: '2026-01-09T10:00:00Z',
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository = new SavedQueryRepository(mockSupabase as any)
  })

  describe('create', () => {
    it('creates a new saved query', async () => {
      const insertData: PosthogSavedQueryInsert = {
        workspace_id: 'workspace-456',
        name: 'My Query',
        description: 'A test query',
        query_text: 'SELECT * FROM events',
      }

      mockSupabase._mockSingle.mockResolvedValue({
        data: mockSavedQuery,
        error: null,
      })

      const result = await repository.create(insertData)

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_saved_queries')
      expect(mockSupabase._mockInsert).toHaveBeenCalledWith(insertData)
      expect(result).toEqual(mockSavedQuery)
    })

    it('throws error on create failure', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      })

      await expect(
        repository.create({
          workspace_id: 'workspace-456',
          name: 'My Query',
          query_text: 'SELECT *',
        })
      ).rejects.toThrow('Failed to create saved query: Insert failed')
    })
  })

  describe('getById', () => {
    it('returns saved query when found', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: mockSavedQuery,
        error: null,
      })

      const result = await repository.getById('saved-query-123')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_saved_queries')
      expect(mockSupabase._mockEq).toHaveBeenCalledWith('id', 'saved-query-123')
      expect(result).toEqual(mockSavedQuery)
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

  describe('getAll', () => {
    it('returns all saved queries for workspace', async () => {
      mockSupabase._chain.order.mockResolvedValue({
        data: [mockSavedQuery],
        error: null,
      })

      const result = await repository.getAll('workspace-456')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_saved_queries')
      expect(mockSupabase._mockEq).toHaveBeenCalledWith('workspace_id', 'workspace-456')
      expect(result).toEqual([mockSavedQuery])
    })

    it('filters active only when specified', async () => {
      // Need proper chain for: select().eq().order() then conditionally .eq()
      const finalPromise = Promise.resolve({
        data: [mockSavedQuery],
        error: null,
      })

      mockSupabase._chain.order.mockReturnValue({
        eq: vi.fn().mockReturnValue(finalPromise),
        then: finalPromise.then.bind(finalPromise),
      })

      const result = await repository.getAll('workspace-456', { activeOnly: true })

      expect(mockSupabase._mockEq).toHaveBeenCalledWith('workspace_id', 'workspace-456')
      expect(result).toEqual([mockSavedQuery])
    })
  })

  describe('update', () => {
    it('updates saved query', async () => {
      const updatedQuery = { ...mockSavedQuery, name: 'Updated Query' }
      mockSupabase._mockSingle.mockResolvedValue({
        data: updatedQuery,
        error: null,
      })

      const result = await repository.update('saved-query-123', { name: 'Updated Query' })

      expect(mockSupabase._mockUpdate).toHaveBeenCalled()
      expect(result.name).toBe('Updated Query')
    })

    it('throws error on update failure', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      })

      await expect(
        repository.update('saved-query-123', { name: 'New Name' })
      ).rejects.toThrow('Failed to update saved query: Update failed')
    })
  })

  describe('delete', () => {
    it('deletes saved query', async () => {
      mockSupabase._mockEq.mockResolvedValue({
        error: null,
      })

      await repository.delete('saved-query-123')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_saved_queries')
      expect(mockSupabase._mockDelete).toHaveBeenCalled()
      expect(mockSupabase._mockEq).toHaveBeenCalledWith('id', 'saved-query-123')
    })

    it('throws error on delete failure', async () => {
      mockSupabase._mockEq.mockResolvedValue({
        error: { message: 'Delete failed' },
      })

      await expect(repository.delete('saved-query-123')).rejects.toThrow(
        'Failed to delete saved query: Delete failed'
      )
    })
  })

  describe('deactivate', () => {
    it('sets is_active to false', async () => {
      const deactivatedQuery = { ...mockSavedQuery, is_active: false }
      mockSupabase._mockSingle.mockResolvedValue({
        data: deactivatedQuery,
        error: null,
      })

      const result = await repository.deactivate('saved-query-123')

      expect(result.is_active).toBe(false)
    })
  })

  describe('activate', () => {
    it('sets is_active to true', async () => {
      const activatedQuery = { ...mockSavedQuery, is_active: true }
      mockSupabase._mockSingle.mockResolvedValue({
        data: activatedQuery,
        error: null,
      })

      const result = await repository.activate('saved-query-123')

      expect(result.is_active).toBe(true)
    })
  })

  describe('existsByName', () => {
    it('returns true when name exists', async () => {
      // Need to mock for double .eq() chain
      mockSupabase._chain.select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: 1,
            error: null,
          }),
        }),
      })

      const exists = await repository.existsByName('workspace-456', 'My Query')

      expect(exists).toBe(true)
    })

    it('returns false when name does not exist', async () => {
      mockSupabase._chain.select.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            count: 0,
            error: null,
          }),
        }),
      })

      const exists = await repository.existsByName('workspace-456', 'Nonexistent')

      expect(exists).toBe(false)
    })
  })

  describe('getByPosthogId', () => {
    it('returns saved query when found by PostHog ID', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: mockSavedQuery,
        error: null,
      })

      const result = await repository.getByPosthogId('posthog-query-id')

      expect(mockSupabase._mockEq).toHaveBeenCalledWith('posthog_query_id', 'posthog-query-id')
      expect(result).toEqual(mockSavedQuery)
    })

    it('returns null when not found by PostHog ID', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      })

      const result = await repository.getByPosthogId('nonexistent')

      expect(result).toBeNull()
    })
  })
})
