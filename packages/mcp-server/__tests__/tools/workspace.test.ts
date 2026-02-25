import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/proxy', () => ({
  callApi: vi.fn(),
}))

import { callApi } from '../../src/lib/proxy'
const mockCallApi = vi.mocked(callApi)

describe('Workspace tools', () => {
  let registeredTools: Map<string, { handler: Function }>
  let mockServer: { tool: ReturnType<typeof vi.fn> }
  const mockGetAuth = () => 'Bearer test-token'

  beforeEach(async () => {
    vi.resetAllMocks()
    registeredTools = new Map()
    mockServer = {
      tool: vi.fn(
        (name: string, _desc: string, _schema: unknown, handler: Function) => {
          registeredTools.set(name, { handler })
        }
      ),
    }

    const { registerWorkspaceTools } = await import('../../src/tools/workspace')
    registerWorkspaceTools(mockServer as any, mockGetAuth)
  })

  it('should register 4 workspace tools', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(4)
    expect(registeredTools.has('get_workspace')).toBe(true)
    expect(registeredTools.has('get_integration_status')).toBe(true)
    expect(registeredTools.has('get_account_scores')).toBe(true)
    expect(registeredTools.has('list_accounts')).toBe(true)
  })

  describe('get_workspace', () => {
    it('should call /api/user/workspace', async () => {
      mockCallApi.mockResolvedValue({ data: { workspace: {} }, status: 200 })

      const handler = registeredTools.get('get_workspace')!.handler
      const result = await handler({})

      expect(mockCallApi).toHaveBeenCalledWith('/api/user/workspace', 'Bearer test-token', { toolName: 'get_workspace' })
      expect(result.isError).toBeUndefined()
    })
  })

  describe('get_integration_status', () => {
    it('should call /api/integrations', async () => {
      mockCallApi.mockResolvedValue({ data: { integrations: [] }, status: 200 })

      const handler = registeredTools.get('get_integration_status')!.handler
      await handler({})

      expect(mockCallApi).toHaveBeenCalledWith('/api/integrations', 'Bearer test-token', { toolName: 'get_integration_status' })
    })
  })

  describe('list_accounts', () => {
    it('should call /api/accounts with pagination params', async () => {
      mockCallApi.mockResolvedValue({
        data: { accounts: [], pagination: { page: 1, limit: 25, total: 0, pages: 0 } },
        status: 200,
      })

      const handler = registeredTools.get('list_accounts')!.handler
      await handler({ page: 1, limit: 25, sort_by: 'arr', sort_order: 'desc' })

      expect(mockCallApi).toHaveBeenCalledWith(
        '/api/accounts',
        'Bearer test-token',
        expect.objectContaining({
          params: expect.objectContaining({
            page: '1',
            limit: '25',
            sort_by: 'arr',
            sort_order: 'desc',
          }),
        })
      )
    })
  })

  describe('get_account_scores', () => {
    it('should call /api/heuristics/scores/:id', async () => {
      const accountId = '550e8400-e29b-41d4-a716-446655440000'
      mockCallApi.mockResolvedValue({ data: { scores: {} }, status: 200 })

      const handler = registeredTools.get('get_account_scores')!.handler
      await handler({ account_id: accountId })

      expect(mockCallApi).toHaveBeenCalledWith(
        `/api/heuristics/scores/${accountId}`,
        'Bearer test-token',
        { toolName: 'get_account_scores' }
      )
    })
  })
})
