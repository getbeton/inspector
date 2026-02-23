import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the proxy module
vi.mock('../../src/lib/proxy', () => ({
  callApi: vi.fn(),
}))

import { callApi } from '../../src/lib/proxy'
const mockCallApi = vi.mocked(callApi)

// We test the tool registration by importing and calling the register function
// with a mock McpServer
describe('Signal tools', () => {
  let registeredTools: Map<string, { handler: Function; schema: unknown }>
  let mockServer: { tool: ReturnType<typeof vi.fn> }
  const mockGetAuth = () => 'Bearer test-token'

  beforeEach(async () => {
    vi.resetAllMocks()
    registeredTools = new Map()
    mockServer = {
      tool: vi.fn(
        (name: string, _desc: string, schema: unknown, handler: Function) => {
          registeredTools.set(name, { handler, schema })
        }
      ),
    }

    // Dynamic import to avoid circular issues
    const { registerSignalTools } = await import('../../src/tools/signals')
    registerSignalTools(mockServer as any, mockGetAuth)
  })

  it('should register 5 signal tools', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(5)
    expect(registeredTools.has('list_signals')).toBe(true)
    expect(registeredTools.has('get_signal')).toBe(true)
    expect(registeredTools.has('create_signal')).toBe(true)
    expect(registeredTools.has('get_signal_metrics')).toBe(true)
    expect(registeredTools.has('get_dashboard_metrics')).toBe(true)
  })

  describe('list_signals', () => {
    it('should call /api/signals with query params', async () => {
      mockCallApi.mockResolvedValue({
        data: { signals: [], pagination: { page: 1, limit: 50, total: 0, pages: 0 } },
        status: 200,
      })

      const handler = registeredTools.get('list_signals')!.handler
      const result = await handler({ page: 1, limit: 50 })

      expect(mockCallApi).toHaveBeenCalledWith(
        '/api/signals',
        'Bearer test-token',
        expect.objectContaining({ params: expect.objectContaining({ page: '1', limit: '50' }) })
      )
      expect(result.content[0].type).toBe('text')
      expect(result.isError).toBeUndefined()
    })

    it('should return error for non-200 status', async () => {
      mockCallApi.mockResolvedValue({
        data: { error: 'Unauthorized' },
        status: 500,
      })

      const handler = registeredTools.get('list_signals')!.handler
      const result = await handler({ page: 1, limit: 50 })

      expect(result.isError).toBe(true)
    })
  })

  describe('get_signal', () => {
    it('should call /api/signals/:id', async () => {
      const signalId = '550e8400-e29b-41d4-a716-446655440000'
      mockCallApi.mockResolvedValue({
        data: { signal: { id: signalId }, metrics: null },
        status: 200,
      })

      const handler = registeredTools.get('get_signal')!.handler
      await handler({ signal_id: signalId })

      expect(mockCallApi).toHaveBeenCalledWith(
        `/api/signals/${signalId}`,
        'Bearer test-token'
      )
    })
  })

  describe('create_signal', () => {
    it('should POST to /api/signals/custom', async () => {
      mockCallApi.mockResolvedValue({
        data: { signal_definition: { id: 'new-id' }, metrics: { status: 'calculating' } },
        status: 202,
      })

      const handler = registeredTools.get('create_signal')!.handler
      const result = await handler({
        name: 'Test Signal',
        event_name: 'pageview',
        condition_operator: 'gte',
        condition_value: 2,
        time_window_days: 7,
      })

      expect(mockCallApi).toHaveBeenCalledWith(
        '/api/signals/custom',
        'Bearer test-token',
        expect.objectContaining({ method: 'POST' })
      )
      expect(result.isError).toBeUndefined()
    })
  })

  describe('get_signal_metrics', () => {
    it('should call /api/signals/:id/metrics', async () => {
      const signalId = '550e8400-e29b-41d4-a716-446655440000'
      mockCallApi.mockResolvedValue({
        data: { status: 'ready', metrics: { total_count: 42 } },
        status: 200,
      })

      const handler = registeredTools.get('get_signal_metrics')!.handler
      await handler({ signal_id: signalId })

      expect(mockCallApi).toHaveBeenCalledWith(
        `/api/signals/${signalId}/metrics`,
        'Bearer test-token'
      )
    })
  })

  describe('get_dashboard_metrics', () => {
    it('should call /api/signals/dashboard/metrics with lookback', async () => {
      mockCallApi.mockResolvedValue({
        data: { metrics: { total_accounts: 10 } },
        status: 200,
      })

      const handler = registeredTools.get('get_dashboard_metrics')!.handler
      await handler({ lookback_days: 30 })

      expect(mockCallApi).toHaveBeenCalledWith(
        '/api/signals/dashboard/metrics',
        'Bearer test-token',
        expect.objectContaining({ params: { lookback_days: '30' } })
      )
    })
  })
})
