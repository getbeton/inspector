import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import {
  withRLSContext,
  setRLSContext,
  RLSContextError,
  type RLSContext,
} from './rls-context'

// Mock Supabase modules
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/supabase/helpers', () => ({
  getWorkspaceMembership: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'

const mockCreateClient = vi.mocked(createClient)
const mockGetWorkspaceMembership = vi.mocked(getWorkspaceMembership)

// Create mock Supabase client
function createMockSupabase(options: {
  user?: { id: string } | null
  authError?: Error | null
  rpcError?: Error | null
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.user ?? null },
        error: options.authError ?? null,
      }),
    },
    rpc: vi.fn().mockResolvedValue({
      data: null,
      error: options.rpcError ?? null,
    }),
  }
}

// Create mock NextRequest
function createMockRequest(url = 'https://example.com/api/test') {
  return new NextRequest(url)
}

describe('withRLSContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('successful context setup', () => {
    it('sets RLS context and executes handler for valid workspace', async () => {
      const mockSupabase = createMockSupabase({ user: { id: 'user-123' } })
      mockCreateClient.mockResolvedValue(mockSupabase as any)
      mockGetWorkspaceMembership.mockResolvedValue({
        workspaceId: 'workspace-456',
        userId: 'user-123',
        role: 'admin',
      })

      const handler = vi.fn().mockResolvedValue(
        NextResponse.json({ success: true })
      )

      const wrappedHandler = withRLSContext(handler)
      const request = createMockRequest()

      const response = await wrappedHandler(request)
      const body = await response.json()

      expect(body).toEqual({ success: true })
      expect(mockSupabase.rpc).toHaveBeenCalledWith('set_workspace_context', {
        workspace_uuid: 'workspace-456',
      })
      expect(handler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          workspaceId: 'workspace-456',
          userId: 'user-123',
          role: 'admin',
        })
      )
    })

    it('passes supabase client to handler', async () => {
      const mockSupabase = createMockSupabase({ user: { id: 'user-123' } })
      mockCreateClient.mockResolvedValue(mockSupabase as any)
      mockGetWorkspaceMembership.mockResolvedValue({
        workspaceId: 'workspace-456',
        userId: 'user-123',
        role: 'member',
      })

      let capturedContext: RLSContext | null = null
      const handler = vi.fn().mockImplementation(async (_req, ctx) => {
        capturedContext = ctx
        return NextResponse.json({})
      })

      await withRLSContext(handler)(createMockRequest())

      expect(capturedContext).not.toBeNull()
      expect(capturedContext!.supabase).toBe(mockSupabase)
    })
  })

  describe('authentication errors', () => {
    it('returns 401 for unauthenticated requests', async () => {
      const mockSupabase = createMockSupabase({ user: null })
      mockCreateClient.mockResolvedValue(mockSupabase as any)

      const handler = vi.fn()
      const wrappedHandler = withRLSContext(handler)

      const response = await wrappedHandler(createMockRequest())
      const body = await response.json()

      expect(response.status).toBe(401)
      expect(body.error_code).toBe('UNAUTHENTICATED')
      expect(body.retryable).toBe(false)
      expect(handler).not.toHaveBeenCalled()
    })

    it('returns 401 when auth throws error', async () => {
      const mockSupabase = createMockSupabase({
        user: null,
        authError: new Error('Auth failed'),
      })
      mockCreateClient.mockResolvedValue(mockSupabase as any)

      const handler = vi.fn()
      const wrappedHandler = withRLSContext(handler)

      const response = await wrappedHandler(createMockRequest())

      expect(response.status).toBe(401)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('workspace errors', () => {
    it('returns 403 when user has no workspace', async () => {
      const mockSupabase = createMockSupabase({ user: { id: 'user-123' } })
      mockCreateClient.mockResolvedValue(mockSupabase as any)
      mockGetWorkspaceMembership.mockResolvedValue(null)

      const handler = vi.fn()
      const wrappedHandler = withRLSContext(handler)

      const response = await wrappedHandler(createMockRequest())
      const body = await response.json()

      expect(response.status).toBe(403)
      expect(body.error_code).toBe('NO_WORKSPACE')
      expect(body.retryable).toBe(false)
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('RLS context errors', () => {
    it('returns 500 when set_workspace_context fails', async () => {
      const mockSupabase = createMockSupabase({
        user: { id: 'user-123' },
        rpcError: new Error('RPC failed'),
      })
      mockCreateClient.mockResolvedValue(mockSupabase as any)
      mockGetWorkspaceMembership.mockResolvedValue({
        workspaceId: 'workspace-456',
        userId: 'user-123',
        role: 'admin',
      })

      const handler = vi.fn()
      const wrappedHandler = withRLSContext(handler)

      const response = await wrappedHandler(createMockRequest())
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error_code).toBe('RLS_CONTEXT_FAILURE')
      expect(body.retryable).toBe(false)
      expect(handler).not.toHaveBeenCalled()
    })

    it('aborts request on context failure (security check)', async () => {
      // This is a CRITICAL security test:
      // If RLS context cannot be set, the handler MUST NOT execute
      const mockSupabase = createMockSupabase({
        user: { id: 'user-123' },
        rpcError: new Error('Database connection failed'),
      })
      mockCreateClient.mockResolvedValue(mockSupabase as any)
      mockGetWorkspaceMembership.mockResolvedValue({
        workspaceId: 'workspace-456',
        userId: 'user-123',
        role: 'admin',
      })

      const handler = vi.fn()
      await withRLSContext(handler)(createMockRequest())

      // CRITICAL: Handler must NOT be called if context fails
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('handler errors', () => {
    it('propagates errors from handler', async () => {
      const mockSupabase = createMockSupabase({ user: { id: 'user-123' } })
      mockCreateClient.mockResolvedValue(mockSupabase as any)
      mockGetWorkspaceMembership.mockResolvedValue({
        workspaceId: 'workspace-456',
        userId: 'user-123',
        role: 'admin',
      })

      const handler = vi.fn().mockRejectedValue(new Error('Handler error'))
      const wrappedHandler = withRLSContext(handler)

      const response = await wrappedHandler(createMockRequest())
      const body = await response.json()

      expect(response.status).toBe(500)
      expect(body.error_code).toBe('INTERNAL_ERROR')
    })
  })
})

describe('setRLSContext', () => {
  it('calls set_workspace_context RPC', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockSupabase = { rpc: mockRpc } as any

    await setRLSContext(mockSupabase, 'workspace-123')

    expect(mockRpc).toHaveBeenCalledWith('set_workspace_context', {
      workspace_uuid: 'workspace-123',
    })
  })

  it('throws RLSContextError on failure', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'RPC failed' },
    })
    const mockSupabase = { rpc: mockRpc } as any

    await expect(setRLSContext(mockSupabase, 'workspace-123')).rejects.toThrow(
      RLSContextError
    )
  })
})

describe('RLSContextError', () => {
  it('has correct name and properties', () => {
    const error = new RLSContextError('Test error', 403)

    expect(error.name).toBe('RLSContextError')
    expect(error.message).toBe('Test error')
    expect(error.statusCode).toBe(403)
  })

  it('defaults to 500 status code', () => {
    const error = new RLSContextError('Test error')

    expect(error.statusCode).toBe(500)
  })
})

describe('Cross-workspace isolation (SECURITY)', () => {
  it('different workspaces get different contexts', async () => {
    const contextCalls: string[] = []

    const mockSupabase1 = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
      rpc: vi.fn().mockImplementation((_name, { workspace_uuid }) => {
        contextCalls.push(workspace_uuid)
        return Promise.resolve({ data: null, error: null })
      }),
    }

    const mockSupabase2 = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-2' } },
          error: null,
        }),
      },
      rpc: vi.fn().mockImplementation((_name, { workspace_uuid }) => {
        contextCalls.push(workspace_uuid)
        return Promise.resolve({ data: null, error: null })
      }),
    }

    // Simulate two requests from different workspaces
    let callCount = 0
    mockCreateClient.mockImplementation(async () => {
      callCount++
      return (callCount === 1 ? mockSupabase1 : mockSupabase2) as any
    })

    mockGetWorkspaceMembership
      .mockResolvedValueOnce({
        workspaceId: 'workspace-A',
        userId: 'user-1',
        role: 'admin',
      })
      .mockResolvedValueOnce({
        workspaceId: 'workspace-B',
        userId: 'user-2',
        role: 'admin',
      })

    const handler = vi.fn().mockResolvedValue(NextResponse.json({}))
    const wrappedHandler = withRLSContext(handler)

    // Request 1 from workspace A
    await wrappedHandler(createMockRequest())

    // Request 2 from workspace B
    await wrappedHandler(createMockRequest())

    // Verify each request got its own workspace context
    expect(contextCalls).toContain('workspace-A')
    expect(contextCalls).toContain('workspace-B')
    expect(contextCalls.length).toBe(2)
  })
})
