import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/proxy', () => ({
  callApi: vi.fn(),
}))

import { callApi } from '../../src/lib/proxy'
const mockCallApi = vi.mocked(callApi)

describe('Mapping tools', () => {
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

    const { registerMappingTools } = await import('../../src/tools/mapping')
    registerMappingTools(mockServer as any, mockGetAuth)
  })

  it('should register 2 mapping tools', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(2)
  })

  describe('get_field_mappings', () => {
    it('should GET /api/integrations/attio/mappings', async () => {
      mockCallApi.mockResolvedValue({
        data: { mappings: { email: 'email_address' } },
        status: 200,
      })

      const handler = registeredTools.get('get_field_mappings')!.handler
      const result = await handler({})

      expect(mockCallApi).toHaveBeenCalledWith(
        '/api/integrations/attio/mappings',
        'Bearer test-token',
        { toolName: 'get_field_mappings' }
      )
      expect(result.isError).toBeUndefined()
    })
  })

  describe('update_field_mappings', () => {
    it('should PUT /api/integrations/attio/mappings', async () => {
      mockCallApi.mockResolvedValue({
        data: { success: true, mappings: { email: 'email' } },
        status: 200,
      })

      const handler = registeredTools.get('update_field_mappings')!.handler
      await handler({ mappings: { email: 'email' } })

      expect(mockCallApi).toHaveBeenCalledWith(
        '/api/integrations/attio/mappings',
        'Bearer test-token',
        expect.objectContaining({
          method: 'PUT',
          body: { mappings: { email: 'email' } },
        })
      )
    })
  })
})
