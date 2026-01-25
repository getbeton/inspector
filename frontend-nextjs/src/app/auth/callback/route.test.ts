import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from './route'

// Mock the Supabase clients
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

const mockCreateClient = createClient as ReturnType<typeof vi.fn>
const mockCreateAdminClient = createAdminClient as ReturnType<typeof vi.fn>

// Helper to create mock request
function createMockRequest(params: Record<string, string> = {}) {
  const searchParams = new URLSearchParams(params)
  const url = `http://localhost:3000/auth/callback?${searchParams.toString()}`
  return new NextRequest(url)
}

// Create a proper chainable mock that handles all Supabase query patterns
function createChainableMock() {
  const results: Record<string, unknown> = {}

  const createChain = () => {
    const chain: Record<string, unknown> = {}
    const methods = ['select', 'eq', 'single', 'insert', 'delete']

    methods.forEach((method) => {
      chain[method] = vi.fn().mockImplementation(() => chain)
    })

    return chain
  }

  const chain = createChain()

  return {
    from: vi.fn().mockReturnValue(chain),
    _chain: chain,
    _setResult: (result: unknown) => {
      ;(chain.single as ReturnType<typeof vi.fn>).mockResolvedValue(result)
    },
    _setInsertResult: (result: unknown) => {
      // For insert without .select().single()
      ;(chain.insert as ReturnType<typeof vi.fn>).mockResolvedValue(result)
    },
  }
}

describe('Auth Callback Route', () => {
  let mockSupabase: ReturnType<typeof createChainableMock> & {
    auth: { exchangeCodeForSession: ReturnType<typeof vi.fn> }
  }
  let mockAdminClient: ReturnType<typeof createChainableMock>

  beforeEach(() => {
    vi.clearAllMocks()

    const baseMockSupabase = createChainableMock()
    mockSupabase = {
      ...baseMockSupabase,
      auth: {
        exchangeCodeForSession: vi.fn(),
      },
    }

    mockAdminClient = createChainableMock()
    mockCreateClient.mockResolvedValue(mockSupabase)
    mockCreateAdminClient.mockReturnValue(mockAdminClient)
  })

  describe('OAuth Error Handling', () => {
    it('redirects to login with error when OAuth returns error', async () => {
      const request = createMockRequest({
        error: 'access_denied',
        error_description: 'User cancelled the request',
      })

      const response = await GET(request)

      expect(response.status).toBe(307) // Redirect
      const location = response.headers.get('Location')
      expect(location).toContain('/login?error=')
      expect(location).toContain('User%20cancelled%20the%20request')
    })

    it('uses error param when error_description is missing', async () => {
      const request = createMockRequest({
        error: 'server_error',
      })

      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('Location')
      expect(location).toContain('/login?error=server_error')
    })
  })

  describe('Code Exchange', () => {
    it('redirects to login when code exchange fails', async () => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid code' },
      })

      const request = createMockRequest({ code: 'invalid-code' })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('Location')
      expect(location).toContain('/login?error=auth_code_exchange_failed')
    })

    it('redirects to login when no code provided', async () => {
      const request = createMockRequest({})
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('Location')
      expect(location).toContain('/login?error=auth_callback_failed')
    })
  })

  describe('Existing User Login', () => {
    it('redirects existing user to home without signup param', async () => {
      const userId = 'user-123'

      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: { user: { id: userId, email: 'test@example.com' }, session: {} },
        error: null,
      })

      // User has existing workspace membership
      mockAdminClient._setResult({
        data: { workspace_id: 'workspace-123' },
        error: null,
      })

      const request = createMockRequest({ code: 'valid-code' })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('Location')
      expect(location).toBe('http://localhost:3000/')
      expect(location).not.toContain('signup=true')
    })

    it('redirects to custom next param for existing users', async () => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' }, session: {} },
        error: null,
      })

      mockAdminClient._setResult({
        data: { workspace_id: 'workspace-123' },
        error: null,
      })

      const request = createMockRequest({ code: 'valid-code', next: '/settings' })
      const response = await GET(request)

      const location = response.headers.get('Location')
      expect(location).toBe('http://localhost:3000/settings')
    })
  })

  describe('Error Handling - Workspace Creation Failures', () => {
    beforeEach(() => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: {
          user: { id: 'new-user-123', email: 'newuser@example.com' },
          session: {},
        },
        error: null,
      })
    })

    it('redirects to error page when workspace creation fails (db error)', async () => {
      // First call: no membership found
      // Second call: workspace creation fails
      let callCount = 0
      ;(mockAdminClient._chain.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // No existing membership
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
        }
        // Workspace creation fails
        return Promise.resolve({ data: null, error: { message: 'Database error' } })
      })

      const request = createMockRequest({ code: 'valid-code' })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('Location')
      expect(location).toContain('/login?error=workspace_creation_failed')
    })

    it('redirects to error page when workspace returns null', async () => {
      let callCount = 0
      ;(mockAdminClient._chain.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
        }
        // Workspace creation returns null (no error but no data)
        return Promise.resolve({ data: null, error: null })
      })

      const request = createMockRequest({ code: 'valid-code' })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('Location')
      expect(location).toContain('/login?error=workspace_creation_failed')
    })
  })

  describe('New User Flow', () => {
    it('includes signup=true param for new users with successful workspace creation', async () => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: {
          user: {
            id: 'new-user-123',
            email: 'newuser@example.com',
            user_metadata: { full_name: 'New User' },
          },
          session: {},
        },
        error: null,
      })

      let singleCallCount = 0
      ;(mockAdminClient._chain.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
        singleCallCount++
        if (singleCallCount === 1) {
          // No existing membership
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
        }
        // Workspace created successfully
        return Promise.resolve({ data: { id: 'new-workspace-123' }, error: null })
      })

      // Insert: first call returns chain (workspace), second call returns promise (member)
      let insertCallCount = 0
      ;(mockAdminClient._chain.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
        insertCallCount++
        if (insertCallCount === 1) {
          return mockAdminClient._chain // For workspace insert -> .select().single()
        }
        return Promise.resolve({ error: null }) // For member insert
      })

      const request = createMockRequest({ code: 'valid-code' })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('Location')
      expect(location).toContain('signup=true')
    })

    it('calls workspace creation with correct table', async () => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: {
          user: { id: 'new-user-123', email: 'newuser@example.com' },
          session: {},
        },
        error: null,
      })

      let singleCallCount = 0
      ;(mockAdminClient._chain.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
        singleCallCount++
        if (singleCallCount === 1) {
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
        }
        return Promise.resolve({ data: { id: 'workspace-123' }, error: null })
      })

      // Insert: first call returns chain (workspace), second call returns promise (member)
      let insertCallCount = 0
      ;(mockAdminClient._chain.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
        insertCallCount++
        if (insertCallCount === 1) {
          return mockAdminClient._chain // For workspace insert -> .select().single()
        }
        return Promise.resolve({ error: null }) // For member insert
      })

      const request = createMockRequest({ code: 'valid-code' })
      await GET(request)

      // Verify from() was called with correct tables
      const fromCalls = (mockAdminClient.from as ReturnType<typeof vi.fn>).mock.calls
      const tableNames = fromCalls.map((call) => call[0])

      expect(tableNames).toContain('workspace_members')
      expect(tableNames).toContain('workspaces')
    })
  })

  describe('Member Creation Failure with Cleanup', () => {
    it('redirects to error page when member creation fails', async () => {
      mockSupabase.auth.exchangeCodeForSession.mockResolvedValue({
        data: {
          user: { id: 'new-user-123', email: 'newuser@example.com' },
          session: {},
        },
        error: null,
      })

      let singleCallCount = 0
      ;(mockAdminClient._chain.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
        singleCallCount++
        if (singleCallCount === 1) {
          // No existing membership
          return Promise.resolve({ data: null, error: { code: 'PGRST116' } })
        }
        // Workspace creation succeeds
        return Promise.resolve({ data: { id: 'orphan-workspace' }, error: null })
      })

      // Member creation fails
      let insertCallCount = 0
      ;(mockAdminClient._chain.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
        insertCallCount++
        if (insertCallCount === 1) {
          // First insert is workspace (returns chain for .select().single())
          return mockAdminClient._chain
        }
        // Second insert is member - fails
        return Promise.resolve({ error: { message: 'Constraint violation' } })
      })

      const request = createMockRequest({ code: 'valid-code' })
      const response = await GET(request)

      expect(response.status).toBe(307)
      const location = response.headers.get('Location')
      expect(location).toContain('/login?error=workspace_setup_failed')

      // Verify cleanup was attempted (delete was called)
      expect(mockAdminClient._chain.delete).toHaveBeenCalled()
    })
  })
})
