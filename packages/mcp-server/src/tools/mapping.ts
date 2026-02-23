/**
 * Field Mapping tools (2 tools) — thin proxy to /api/integrations/attio/mappings
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callApi } from '../lib/proxy.js'
import { httpErrorToMcp, toMcpError } from '../lib/errors.js'

export function registerMappingTools(
  server: McpServer,
  getAuthHeader: () => string | undefined
): void {
  // ── get_field_mappings ─────────────────────────────────────────────
  server.tool(
    'get_field_mappings',
    'Get current PostHog-to-Attio field mappings from the integration config',
    {},
    async () => {
      try {
        const { data, status } = await callApi(
          '/api/integrations/attio/mappings',
          getAuthHeader()
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── update_field_mappings ──────────────────────────────────────────
  server.tool(
    'update_field_mappings',
    'Update PostHog-to-Attio field mappings. Merges with existing config_json.',
    {
      mappings: z.record(z.string(), z.string()).describe('Map of PostHog field names to Attio attribute names'),
    },
    async ({ mappings }) => {
      try {
        const { data, status } = await callApi(
          '/api/integrations/attio/mappings',
          getAuthHeader(),
          { method: 'PUT', body: { mappings } }
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
