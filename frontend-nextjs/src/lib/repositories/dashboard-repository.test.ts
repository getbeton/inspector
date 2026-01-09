import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DashboardRepository } from './dashboard-repository'
import type { PosthogDashboard, PosthogDashboardInsert } from '../types/posthog-query'

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

describe('DashboardRepository', () => {
  let mockSupabase: ReturnType<typeof createMockSupabase>
  let repository: DashboardRepository

  const mockDashboard: PosthogDashboard = {
    id: 'dashboard-123',
    workspace_id: 'workspace-456',
    posthog_dashboard_id: null,
    name: 'My Dashboard',
    description: 'A test dashboard',
    config: { layout: 'grid' },
    is_active: true,
    created_at: '2026-01-09T10:00:00Z',
    updated_at: '2026-01-09T10:00:00Z',
  }

  beforeEach(() => {
    mockSupabase = createMockSupabase()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    repository = new DashboardRepository(mockSupabase as any)
  })

  describe('create', () => {
    it('creates a new dashboard', async () => {
      const insertData: PosthogDashboardInsert = {
        workspace_id: 'workspace-456',
        name: 'My Dashboard',
        description: 'A test dashboard',
        config: { layout: 'grid' },
      }

      mockSupabase._mockSingle.mockResolvedValue({
        data: mockDashboard,
        error: null,
      })

      const result = await repository.create(insertData)

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_dashboards')
      expect(mockSupabase._mockInsert).toHaveBeenCalledWith(insertData)
      expect(result).toEqual(mockDashboard)
    })

    it('throws error on create failure', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Insert failed' },
      })

      await expect(
        repository.create({
          workspace_id: 'workspace-456',
          name: 'My Dashboard',
        })
      ).rejects.toThrow('Failed to create dashboard: Insert failed')
    })
  })

  describe('getById', () => {
    it('returns dashboard when found', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: mockDashboard,
        error: null,
      })

      const result = await repository.getById('dashboard-123')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_dashboards')
      expect(mockSupabase._mockEq).toHaveBeenCalledWith('id', 'dashboard-123')
      expect(result).toEqual(mockDashboard)
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
    it('returns all dashboards for workspace', async () => {
      mockSupabase._chain.order.mockResolvedValue({
        data: [mockDashboard],
        error: null,
      })

      const result = await repository.getAll('workspace-456')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_dashboards')
      expect(mockSupabase._mockEq).toHaveBeenCalledWith('workspace_id', 'workspace-456')
      expect(result).toEqual([mockDashboard])
    })

    it('filters active only when specified', async () => {
      // Need proper chain for: select().eq().order() then conditionally .eq()
      const finalPromise = Promise.resolve({
        data: [mockDashboard],
        error: null,
      })

      mockSupabase._chain.order.mockReturnValue({
        eq: vi.fn().mockReturnValue(finalPromise),
        then: finalPromise.then.bind(finalPromise),
      })

      const result = await repository.getAll('workspace-456', { activeOnly: true })

      expect(mockSupabase._mockEq).toHaveBeenCalledWith('workspace_id', 'workspace-456')
      expect(result).toEqual([mockDashboard])
    })
  })

  describe('update', () => {
    it('updates dashboard', async () => {
      const updatedDashboard = { ...mockDashboard, name: 'Updated Dashboard' }
      mockSupabase._mockSingle.mockResolvedValue({
        data: updatedDashboard,
        error: null,
      })

      const result = await repository.update('dashboard-123', { name: 'Updated Dashboard' })

      expect(mockSupabase._mockUpdate).toHaveBeenCalled()
      expect(result.name).toBe('Updated Dashboard')
    })

    it('throws error on update failure', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: null,
        error: { message: 'Update failed' },
      })

      await expect(
        repository.update('dashboard-123', { name: 'New Name' })
      ).rejects.toThrow('Failed to update dashboard: Update failed')
    })
  })

  describe('delete', () => {
    it('deletes dashboard', async () => {
      mockSupabase._mockEq.mockResolvedValue({
        error: null,
      })

      await repository.delete('dashboard-123')

      expect(mockSupabase.from).toHaveBeenCalledWith('posthog_dashboards')
      expect(mockSupabase._mockDelete).toHaveBeenCalled()
      expect(mockSupabase._mockEq).toHaveBeenCalledWith('id', 'dashboard-123')
    })

    it('throws error on delete failure', async () => {
      mockSupabase._mockEq.mockResolvedValue({
        error: { message: 'Delete failed' },
      })

      await expect(repository.delete('dashboard-123')).rejects.toThrow(
        'Failed to delete dashboard: Delete failed'
      )
    })
  })

  describe('deactivate', () => {
    it('sets is_active to false', async () => {
      const deactivatedDashboard = { ...mockDashboard, is_active: false }
      mockSupabase._mockSingle.mockResolvedValue({
        data: deactivatedDashboard,
        error: null,
      })

      const result = await repository.deactivate('dashboard-123')

      expect(result.is_active).toBe(false)
    })
  })

  describe('activate', () => {
    it('sets is_active to true', async () => {
      const activatedDashboard = { ...mockDashboard, is_active: true }
      mockSupabase._mockSingle.mockResolvedValue({
        data: activatedDashboard,
        error: null,
      })

      const result = await repository.activate('dashboard-123')

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

      const exists = await repository.existsByName('workspace-456', 'My Dashboard')

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
    it('returns dashboard when found by PostHog ID', async () => {
      mockSupabase._mockSingle.mockResolvedValue({
        data: mockDashboard,
        error: null,
      })

      const result = await repository.getByPosthogId('posthog-dashboard-id')

      expect(mockSupabase._mockEq).toHaveBeenCalledWith('posthog_dashboard_id', 'posthog-dashboard-id')
      expect(result).toEqual(mockDashboard)
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

  describe('updateConfig', () => {
    it('updates dashboard config', async () => {
      const newConfig = { layout: 'list', theme: 'dark' }
      const updatedDashboard = { ...mockDashboard, config: newConfig }
      mockSupabase._mockSingle.mockResolvedValue({
        data: updatedDashboard,
        error: null,
      })

      const result = await repository.updateConfig('dashboard-123', newConfig)

      expect(result.config).toEqual(newConfig)
    })
  })
})
