/**
 * Signal tools (5 tools) — thin proxy to /api/signals/*
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { callApi } from '../lib/proxy.js'
import { httpErrorToMcp, toMcpError } from '../lib/errors.js'

export function registerSignalTools(
  server: McpServer,
  getAuthHeader: () => string | undefined
): void {
  // ── list_signals ───────────────────────────────────────────────────
  server.tool(
    'list_signals',
    'List signals with optional filters (type, source, account, date range). Returns enriched signals with lift and confidence metrics.',
    {
      page: z.number().int().positive().default(1).describe('Page number'),
      limit: z.number().int().min(1).max(100).default(50).describe('Results per page'),
      type: z.string().optional().describe('Filter by signal type'),
      source: z.string().optional().describe('Filter by source (e.g. "heuristic", "manual")'),
      account_id: z.string().uuid().optional().describe('Filter by account UUID'),
      start_date: z.string().optional().describe('ISO date string for range start'),
      end_date: z.string().optional().describe('ISO date string for range end'),
    },
    async ({ page, limit, type, source, account_id, start_date, end_date }) => {
      try {
        const params: Record<string, string> = {
          page: String(page),
          limit: String(limit),
        }
        if (type) params.type = type
        if (source) params.source = source
        if (account_id) params.account_id = account_id
        if (start_date) params.start_date = start_date
        if (end_date) params.end_date = end_date

        const { data, status } = await callApi('/api/signals', getAuthHeader(), { params })

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_signal ─────────────────────────────────────────────────────
  server.tool(
    'get_signal',
    'Get detailed info for a specific signal including metrics, related signals, and account scores',
    { signal_id: z.string().uuid().describe('The signal UUID') },
    async ({ signal_id }) => {
      try {
        const { data, status } = await callApi(`/api/signals/${signal_id}`, getAuthHeader())

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── create_signal ──────────────────────────────────────────────────
  server.tool(
    'create_signal',
    'Create a custom signal definition with PostHog event matching. Metrics are calculated asynchronously.',
    {
      name: z.string().describe('Signal display name'),
      event_name: z.string().describe('PostHog event name to match'),
      description: z.string().optional().describe('Signal description'),
      condition_operator: z.enum(['gte', 'gt', 'eq', 'lt', 'lte']).default('gte').describe('Comparison operator'),
      condition_value: z.number().nonnegative().default(1).describe('Threshold value'),
      time_window_days: z.number().int().min(1).max(365).default(7).describe('Time window in days'),
      conversion_event: z.string().optional().describe('Optional conversion event to measure'),
    },
    async (args) => {
      try {
        const { data, status } = await callApi('/api/signals/custom', getAuthHeader(), {
          method: 'POST',
          body: args,
        })

        if (status !== 202 && status !== 201) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_signal_metrics ─────────────────────────────────────────────
  server.tool(
    'get_signal_metrics',
    'Get computed metrics (match count, lift, conversion rate, confidence) for a specific signal',
    { signal_id: z.string().uuid().describe('The signal UUID') },
    async ({ signal_id }) => {
      try {
        const { data, status } = await callApi(
          `/api/signals/${signal_id}/metrics`,
          getAuthHeader()
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )

  // ── get_dashboard_metrics ──────────────────────────────────────────
  server.tool(
    'get_dashboard_metrics',
    'Get aggregated dashboard metrics: total accounts, active accounts, signal counts, ARR, health scores',
    {
      lookback_days: z.number().int().min(1).max(365).default(30).describe('Lookback period in days'),
    },
    async ({ lookback_days }) => {
      try {
        const { data, status } = await callApi(
          '/api/signals/dashboard/metrics',
          getAuthHeader(),
          { params: { lookback_days: String(lookback_days) } }
        )

        if (status !== 200) return httpErrorToMcp(data, status)
        return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
      } catch (error) {
        return toMcpError(error)
      }
    }
  )
}
