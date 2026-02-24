/**
 * MCP tool registrations — 18 tools across 7 groups
 *
 * Mirrors packages/mcp-server/src/tools/* but runs inside Next.js.
 * Each tool proxies to the corresponding API route via callApi().
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { callApi } from './proxy'

type AuthGetter = () => string | undefined

// ─── Helpers ────────────────────────────────────────────────────────────────

function text(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

// ─── Signals (5 tools) ─────────────────────────────────────────────────────

function registerSignalTools(server: McpServer, getAuth: AuthGetter) {
  server.tool(
    'list_signals',
    'List signals with optional filters (type, source, account, date range). Returns enriched signals with lift and confidence metrics.',
    {
      page: z.number().int().default(1),
      limit: z.number().int().min(1).max(100).default(50),
      type: z.string().optional(),
      source: z.string().optional(),
      account_id: z.string().uuid().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional(),
    },
    async (params) => {
      const p: Record<string, string> = {
        page: String(params.page),
        limit: String(params.limit),
      }
      if (params.type) p.type = params.type
      if (params.source) p.source = params.source
      if (params.account_id) p.account_id = params.account_id
      if (params.start_date) p.start_date = params.start_date
      if (params.end_date) p.end_date = params.end_date
      const { data } = await callApi('/api/signals', getAuth(), { params: p })
      return text(data)
    }
  )

  server.tool(
    'get_signal',
    'Get detailed info for a specific signal including metrics, related signals, and account scores.',
    { signal_id: z.string().uuid() },
    async ({ signal_id }) => {
      const { data } = await callApi(`/api/signals/${signal_id}`, getAuth())
      return text(data)
    }
  )

  server.tool(
    'create_signal',
    'Create a custom signal definition with PostHog event matching. Metrics are calculated asynchronously.',
    {
      name: z.string(),
      event_name: z.string(),
      description: z.string().optional(),
      condition_operator: z.enum(['gte', 'gt', 'eq', 'lt', 'lte']).default('gte'),
      condition_value: z.number().default(1),
      time_window_days: z.number().int().min(1).max(365).default(7),
      conversion_event: z.string().optional(),
    },
    async (params) => {
      const { data } = await callApi('/api/signals/custom', getAuth(), {
        method: 'POST',
        body: params,
      })
      return text(data)
    }
  )

  server.tool(
    'get_signal_metrics',
    'Get computed metrics (match count, lift, conversion rate, confidence) for a specific signal.',
    { signal_id: z.string().uuid() },
    async ({ signal_id }) => {
      const { data } = await callApi(`/api/signals/${signal_id}/metrics`, getAuth())
      return text(data)
    }
  )

  server.tool(
    'get_dashboard_metrics',
    'Get aggregated dashboard metrics: total accounts, active accounts, signal counts, ARR, health scores.',
    { lookback_days: z.number().int().min(1).max(365).default(30) },
    async ({ lookback_days }) => {
      const { data } = await callApi('/api/signals/dashboard/metrics', getAuth(), {
        params: { lookback_days: String(lookback_days) },
      })
      return text(data)
    }
  )
}

// ─── Memory (3 tools) ──────────────────────────────────────────────────────

function registerMemoryTools(server: McpServer, getAuth: AuthGetter) {
  server.tool(
    'list_exploration_sessions',
    'List past agent exploration sessions with status and EDA result counts.',
    {
      status: z.enum(['created', 'running', 'completed', 'failed', 'closed']).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    },
    async (params) => {
      const p: Record<string, string> = { limit: String(params.limit) }
      if (params.status) p.status = params.status
      const { data } = await callApi('/api/agent/sessions', getAuth(), { params: p })
      return text(data)
    }
  )

  server.tool(
    'get_eda_results',
    'Get exploratory data analysis results including join suggestions, metrics discovery, and table statistics.',
    { table_id: z.string().optional() },
    async (params) => {
      const p: Record<string, string> = {}
      if (params.table_id) p.table_id = params.table_id
      const { data } = await callApi('/api/agent/data/eda', getAuth(), { params: p })
      return text(data)
    }
  )

  server.tool(
    'get_website_exploration',
    'Get website analysis results: B2B classification, PLG type, ICP description, pricing model.',
    {},
    async () => {
      const { data } = await callApi('/api/agent/data/website-exploration', getAuth())
      return text(data)
    }
  )
}

// ─── Warehouse (2 tools) ───────────────────────────────────────────────────

function registerWarehouseTools(server: McpServer, getAuth: AuthGetter) {
  server.tool(
    'list_warehouse_tables',
    'List all tables available in the PostHog data warehouse (native + external sources).',
    {},
    async () => {
      const { data } = await callApi('/api/agent/list-tables', getAuth())
      return text(data)
    }
  )

  server.tool(
    'get_table_columns',
    'Get the schema (columns with types) for a specific warehouse table.',
    { table_name: z.string() },
    async ({ table_name }) => {
      const { data } = await callApi('/api/agent/list-columns', getAuth(), {
        params: { table_id: table_name },
      })
      return text(data)
    }
  )
}

// ─── Joins (1 tool) ────────────────────────────────────────────────────────

function registerJoinsTools(server: McpServer, getAuth: AuthGetter) {
  server.tool(
    'get_confirmed_joins',
    'Get confirmed table join relationships discovered during agent exploration sessions.',
    {},
    async () => {
      const { data } = await callApi('/api/agent/sessions/joins', getAuth())
      return text(data)
    }
  )
}

// ─── Mapping (2 tools) ─────────────────────────────────────────────────────

function registerMappingTools(server: McpServer, getAuth: AuthGetter) {
  server.tool(
    'get_field_mappings',
    'Get current PostHog-to-Attio field mappings from the integration config.',
    {},
    async () => {
      const { data } = await callApi('/api/integrations/attio/mappings', getAuth())
      return text(data)
    }
  )

  server.tool(
    'update_field_mappings',
    'Update PostHog-to-Attio field mappings. Merges with existing config_json.',
    { mappings: z.record(z.string(), z.string()) },
    async ({ mappings }) => {
      const { data } = await callApi('/api/integrations/attio/mappings', getAuth(), {
        method: 'PUT',
        body: { mappings },
      })
      return text(data)
    }
  )
}

// ─── Billing (1 tool) ──────────────────────────────────────────────────────

function registerBillingTools(server: McpServer, getAuth: AuthGetter) {
  server.tool(
    'create_checkout_link',
    'Generate a Stripe Checkout URL for entering payment details. Returns a URL the user should open in their browser.',
    {
      success_url: z.string().url(),
      cancel_url: z.string().url(),
    },
    async (params) => {
      const { data } = await callApi('/api/billing/checkout', getAuth(), {
        method: 'POST',
        body: params,
      })
      return text(data)
    }
  )
}

// ─── Workspace (4 tools) ───────────────────────────────────────────────────

function registerWorkspaceTools(server: McpServer, getAuth: AuthGetter) {
  server.tool(
    'get_workspace',
    'Get workspace info including setup completion status, connected integrations, and billing state.',
    {},
    async () => {
      const { data } = await callApi('/api/user/workspace', getAuth())
      return text(data)
    }
  )

  server.tool(
    'get_integration_status',
    'List all integration connection statuses (PostHog, Stripe, Attio, Apollo).',
    {},
    async () => {
      const { data } = await callApi('/api/integrations', getAuth())
      return text(data)
    }
  )

  server.tool(
    'get_account_scores',
    'Get health, expansion, and churn risk scores for a specific account.',
    { account_id: z.string().uuid() },
    async ({ account_id }) => {
      const { data } = await callApi(`/api/heuristics/scores/${account_id}`, getAuth())
      return text(data)
    }
  )

  server.tool(
    'list_accounts',
    'List accounts with health scores, ARR, and signal counts. Supports pagination and filtering.',
    {
      page: z.number().int().default(1),
      limit: z.number().int().min(1).max(100).default(50),
      status: z.enum(['active', 'churned', 'trial']).optional(),
      sort_by: z.enum(['health_score', 'arr', 'name', 'created_at']).default('health_score'),
      sort_order: z.enum(['asc', 'desc']).default('desc'),
    },
    async (params) => {
      const p: Record<string, string> = {
        page: String(params.page),
        limit: String(params.limit),
        sort_by: params.sort_by,
        sort_order: params.sort_order,
      }
      if (params.status) p.status = params.status
      const { data } = await callApi('/api/accounts', getAuth(), { params: p })
      return text(data)
    }
  )
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function registerAllTools(server: McpServer, getAuth: AuthGetter) {
  registerSignalTools(server, getAuth)
  registerMemoryTools(server, getAuth)
  registerWarehouseTools(server, getAuth)
  registerJoinsTools(server, getAuth)
  registerMappingTools(server, getAuth)
  registerBillingTools(server, getAuth)
  registerWorkspaceTools(server, getAuth)
}
