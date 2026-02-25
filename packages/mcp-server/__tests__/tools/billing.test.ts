import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../src/lib/proxy', () => ({
  callApi: vi.fn(),
}))

import { callApi } from '../../src/lib/proxy'
const mockCallApi = vi.mocked(callApi)

describe('Billing tools', () => {
  let registeredTools: Map<string, { handler: (...args: unknown[]) => unknown }>
  let mockServer: { tool: ReturnType<typeof vi.fn> }
  const mockGetAuth = () => 'Bearer test-token'

  beforeEach(async () => {
    vi.resetAllMocks()
    registeredTools = new Map()
    mockServer = {
      tool: vi.fn(
        (name: string, _desc: string, _schema: unknown, handler: (...args: unknown[]) => unknown) => {
          registeredTools.set(name, { handler })
        }
      ),
    }

    const { registerBillingTools } = await import('../../src/tools/billing')
    registerBillingTools(mockServer as any, mockGetAuth)
  })

  it('should register 1 billing tool', () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(1)
  })

  describe('create_checkout_link', () => {
    it('should POST to /api/billing/checkout', async () => {
      mockCallApi.mockResolvedValue({
        data: { checkout_url: 'https://checkout.stripe.com/...' },
        status: 200,
      })

      const handler = registeredTools.get('create_checkout_link')!.handler
      const result = await handler({
        success_url: 'https://app.beton.io/settings?success=true',
        cancel_url: 'https://app.beton.io/settings',
      })

      expect(mockCallApi).toHaveBeenCalledWith(
        '/api/billing/checkout',
        'Bearer test-token',
        expect.objectContaining({
          method: 'POST',
          body: {
            success_url: 'https://app.beton.io/settings?success=true',
            cancel_url: 'https://app.beton.io/settings',
          },
        })
      )
      expect(result.isError).toBeUndefined()
    })
  })
})
