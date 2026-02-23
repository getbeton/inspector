/**
 * Workspace & Account tools (4 tools) — thin proxy to /api/*
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callApi } from '../lib/proxy.js'
import { httpErrorToMcp, toMcpError } from '../lib/errors.js'

export function registerWorkspaceTools(
  server: McpServer,
  getAuthHeader: () => string | undefined
): void {
  // ── get_workspace ──────────────────────────────────────────────────
  server.tool(
    'get_workspace',
    'Get workspace info including setup completion status, connected integrations, and billing state',
    {},
    async () => {
      try {
        const { data, status } = await callApi('/api/user/workspace', getAuthHeader(), { toolName: 'get_workspace' })

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_integration_status ─────────────────────────────────────────
  server.tool(
    'get_integration_status',
    'List all integration connection statuses (PostHog, Stripe, Attio, Apollo)',
    {},
    async () => {
      try {
        const { data, status } = await callApi('/api/integrations', getAuthHeader(), { toolName: 'get_integration_status' })

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_account_scores ─────────────────────────────────────────────
  server.tool(
    'get_account_scores',
    'Get health, expansion, and churn risk scores for a specific account',
    { account_id: z.string().uuid().describe('The account UUID') },
    async ({ account_id }) => {
      try {
        const { data, status } = await callApi(
          `/api/heuristics/scores/${account_id}`,
          getAuthHeader(),
          { toolName: 'get_account_scores' }
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── list_accounts ──────────────────────────────────────────────────
  server.tool(
    'list_accounts',
    'List accounts with health scores, ARR, and signal counts. Supports pagination and filtering.',
    {
      page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).default(50).describe('Results per page (default: 50, max: 100)'),
      status: z.enum(['active', 'churned', 'trial']).optional().describe('Filter by account status'),
      sort_by: z.enum(['health_score', 'arr', 'name', 'created_at']).default('health_score').describe('Sort field'),
      sort_order: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
    },
    async ({ page, limit, status, sort_by, sort_order }) => {
      try {
        const params: Record<string, string> = {
          page: String(page),
          limit: String(limit),
          sort_by,
          sort_order,
        }
        if (status) params.status = status

        const { data, status: httpStatus } = await callApi('/api/accounts', getAuthHeader(), { params, toolName: 'list_accounts' })

        if (httpStatus !== 200) return httpErrorToMcp(data, httpStatus)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
