/**
 * Joins tool (1 tool) — thin proxy to /api/agent/sessions/joins
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callApi } from '../lib/proxy.js'
import { httpErrorToMcp, toMcpError } from '../lib/errors.js'

export function registerJoinsTools(
  server: McpServer,
  getAuthHeader: () => string | undefined
): void {
  server.tool(
    'get_confirmed_joins',
    'Get confirmed table join relationships discovered during agent exploration sessions',
    {},
    async () => {
      try {
        const { data, status } = await callApi(
          '/api/agent/sessions/joins',
          getAuthHeader()
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
