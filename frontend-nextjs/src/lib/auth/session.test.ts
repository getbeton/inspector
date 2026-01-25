import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSession, isAuthenticated } from './session'

// Mock the Supabase clients
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`)
  }),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const mockCreateClient = createClient as ReturnType<typeof vi.fn>
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>

// Helper to create chainable Supabase mock
function createSupabaseMock() {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  }

  return {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn().mockReturnValue(mockChain),
    _chain: mockChain,
  }
}

describe('Session Management', () => {
  let mockSupabase: ReturnType<typeof createSupabaseMock>
  let mockAdminClient: ReturnType<typeof createSupabaseMock>

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createSupabaseMock()
    mockAdminClient = createSupabaseMock()
    mockCreateClient.mockResolvedValue(mockSupabase)
    mockCreateAdminClient.mockReturnValue(mockAdminClient)
  })

  describe('getSession', () => {
    it('returns null when auth.getUser returns error', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Not authenticated' },
      })

      const session = await getSession()

      expect(session).toBeNull()
    })

    it('returns null when no user found', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const session = await getSession()

      expect(session).toBeNull()
    })

    it('returns session with workspace info for authenticated user', async () => {
      const userId = 'user-123'
      const workspaceId = 'workspace-456'

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: userId,
            email: 'test@example.com',
            user_metadata: { full_name: 'Test User' },
          },
        },
        error: null,
      })

      mockAdminClient._chain.single.mockResolvedValue({
        data: {
          workspace_id: workspaceId,
          role: 'owner',
          workspaces: {
            id: workspaceId,
            name: 'Test Workspace',
            slug: 'test-workspace',
          },
        },
        error: null,
      })

      const session = await getSession()

      expect(session).toEqual({
        sub: userId,
        email: 'test@example.com',
        name: 'Test User',
        workspace_id: workspaceId,
        workspace_name: 'Test Workspace',
        role: 'owner',
      })
    })

    it('returns session without workspace when user has no membership', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'orphan-user',
            email: 'orphan@example.com',
            user_metadata: {},
          },
        },
        error: null,
      })

      // PGRST116 = no rows found
      mockAdminClient._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      })

      const session = await getSession()

      expect(session).toEqual({
        sub: 'orphan-user',
        email: 'orphan@example.com',
        name: 'orphan',
        workspace_id: undefined,
        workspace_name: undefined,
        role: undefined,
      })
    })

    it('uses email prefix as name when full_name not provided', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'john.doe@example.com',
            user_metadata: {},
          },
        },
        error: null,
      })

      mockAdminClient._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      })

      const session = await getSession()

      expect(session?.name).toBe('john.doe')
    })

    it('uses "User" as fallback name when email is empty', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: '',
            user_metadata: {},
          },
        },
        error: null,
      })

      mockAdminClient._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      })

      const session = await getSession()

      expect(session?.name).toBe('User')
    })

    it('logs database errors (non-PGRST116) but still returns session', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: {},
          },
        },
        error: null,
      })

      mockAdminClient._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST500', message: 'Database connection error' },
      })

      const session = await getSession()

      // Should still return session (without workspace)
      expect(session).not.toBeNull()
      expect(session?.sub).toBe('user-123')

      // Should log the error
      expect(consoleSpy).toHaveBeenCalledWith(
        '[getSession] Membership query failed:',
        'PGRST500',
        'Database connection error'
      )

      consoleSpy.mockRestore()
    })

    it('does not log PGRST116 errors (expected for new users)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-123',
            email: 'test@example.com',
            user_metadata: {},
          },
        },
        error: null,
      })

      mockAdminClient._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      })

      await getSession()

      // Should NOT log PGRST116 errors
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('[getSession] Membership query failed:'),
        expect.anything(),
        expect.anything()
      )

      consoleSpy.mockRestore()
    })

    it('catches exceptions and returns null', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      mockSupabase.auth.getUser.mockRejectedValue(new Error('Network error'))

      const session = await getSession()

      expect(session).toBeNull()
      expect(consoleSpy).toHaveBeenCalledWith(
        '[getSession] Exception:',
        expect.any(Error)
      )

      consoleSpy.mockRestore()
    })
  })

  describe('isAuthenticated', () => {
    it('returns true when session exists', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: {
          user: { id: 'user-123', email: 'test@example.com', user_metadata: {} },
        },
        error: null,
      })

      mockAdminClient._chain.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' },
      })

      const result = await isAuthenticated()

      expect(result).toBe(true)
    })

    it('returns false when no session', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      })

      const result = await isAuthenticated()

      expect(result).toBe(false)
    })
  })
})
