/**
 * Billing tool (1 tool) — thin proxy to /api/billing/checkout
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callApi } from '../lib/proxy.js'
import { httpErrorToMcp, toMcpError } from '../lib/errors.js'

export function registerBillingTools(
  server: McpServer,
  getAuthHeader: () => string | undefined
): void {
  server.tool(
    'create_checkout_link',
    'Generate a Stripe Checkout URL for entering payment details. Returns a URL the user should open in their browser.',
    {
      success_url: z.string().url().describe('URL to redirect to after successful card entry'),
      cancel_url: z.string().url().describe('URL to redirect to if user cancels'),
    },
    async ({ success_url, cancel_url }) => {
      try {
        const { data, status } = await callApi(
          '/api/billing/checkout',
          getAuthHeader(),
          { method: 'POST', body: { success_url, cancel_url }, toolName: 'create_checkout_link' }
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
