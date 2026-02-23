/**
 * Memory tools (3 tools) — thin proxy to /api/agent/*
 *
 * These tools read agent exploration data (sessions, EDA results, website analysis).
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callApi } from '../lib/proxy.js'
import { httpErrorToMcp, toMcpError } from '../lib/errors.js'

export function registerMemoryTools(
  server: McpServer,
  getAuthHeader: () => string | undefined
): void {
  // ── list_exploration_sessions ──────────────────────────────────────
  server.tool(
    'list_exploration_sessions',
    'List past agent exploration sessions with status and EDA result counts',
    {
      status: z.enum(['created', 'running', 'completed', 'failed', 'closed']).optional().describe('Filter by session status'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max results to return'),
    },
    async ({ status, limit }) => {
      try {
        const params: Record<string, string> = { limit: String(limit) }
        if (status) params.status = status

        const { data, status: httpStatus } = await callApi(
          '/api/agent/sessions',
          getAuthHeader(),
          { params, toolName: 'list_exploration_sessions' }
        )

        if (httpStatus !== 200) return httpErrorToMcp(data, httpStatus)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_eda_results ────────────────────────────────────────────────
  server.tool(
    'get_eda_results',
    'Get exploratory data analysis results including join suggestions, metrics discovery, and table statistics',
    {
      table_id: z.string().optional().describe('Filter by specific table ID'),
    },
    async ({ table_id }) => {
      try {
        const params: Record<string, string> = {}
        if (table_id) params.table_id = table_id

        const { data, status } = await callApi(
          '/api/agent/data/eda',
          getAuthHeader(),
          { params, toolName: 'get_eda_results' }
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_website_exploration ────────────────────────────────────────
  server.tool(
    'get_website_exploration',
    'Get website analysis results: B2B classification, PLG type, ICP description, pricing model',
    {},
    async () => {
      try {
        const { data, status } = await callApi(
          '/api/agent/data/website-exploration',
          getAuthHeader(),
          { toolName: 'get_website_exploration' }
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
