/**
 * PostHog Warehouse tools (2 tools) — thin proxy to /api/agent/*
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callApi } from '../lib/proxy.js'
import { httpErrorToMcp, toMcpError } from '../lib/errors.js'

export function registerWarehouseTools(
  server: McpServer,
  getAuthHeader: () => string | undefined
): void {
  // ── list_warehouse_tables ──────────────────────────────────────────
  server.tool(
    'list_warehouse_tables',
    'List all tables available in the PostHog data warehouse (native + external sources)',
    {},
    async () => {
      try {
        const { data, status } = await callApi(
          '/api/agent/list-tables',
          getAuthHeader()
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_table_columns ──────────────────────────────────────────────
  server.tool(
    'get_table_columns',
    'Get the schema (columns with types) for a specific warehouse table',
    {
      table_name: z.string().describe('The table name to inspect'),
    },
    async ({ table_name }) => {
      try {
        const { data, status } = await callApi(
          '/api/agent/list-columns',
          getAuthHeader(),
          { params: { table_id: table_name } }
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
