/**
 * MCP tool registrations for the embedded /mcp endpoint.
 *
 * All 18 tools from the standalone MCP server, re-implemented to use the
 * Supabase admin client directly (bypasses RLS, workspace isolation enforced
 * by explicit workspace_id filtering on every query).
 *
 * Tables not in the auto-generated types (signal_definitions, integration_definitions)
 * are accessed via `(admin as any)` cast — per CLAUDE.md convention.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { createAdminClient } from '@/lib/supabase/admin'

// ─── Helpers ───────────────────────────────────────────────────────────────

type ToolResult = { content: Array<{ type: 'text'; text: string }>; isError?: true }

function ok(data: unknown): ToolResult {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function err(msg: string): ToolResult {
  return { content: [{ type: 'text' as const, text: `Error: ${msg}` }], isError: true }
}

function handle(e: unknown): ToolResult {
  return err(e instanceof Error ? e.message : 'Unknown error')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

// ─── Registration ──────────────────────────────────────────────────────────

export function registerAllTools(server: McpServer, workspaceId: string): void {
  const admin = createAdminClient()
  // Untyped handle for tables not yet in auto-generated types
  const db: AnyClient = admin

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKSPACE & ACCOUNT TOOLS (4)
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_workspace',
    'Get workspace info including setup completion status, connected integrations, and billing state',
    {},
    async () => {
      try {
        const { data, error } = await admin
          .from('workspaces')
          .select('*')
          .eq('id', workspaceId)
          .single()
        if (error) return err(error.message)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'get_integration_status',
    'List all integration connection statuses (PostHog, Stripe, Attio, Apollo)',
    {},
    async () => {
      try {
        const { data, error } = await admin
          .from('integration_configs')
          .select('id, integration_name, status, is_active, created_at, updated_at')
          .eq('workspace_id', workspaceId)
        if (error) return err(error.message)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'get_account_scores',
    'Get health, expansion, and churn risk scores for a specific account',
    { account_id: z.string().uuid().describe('The account UUID') },
    async ({ account_id }) => {
      try {
        const { data, error } = await admin
          .from('accounts')
          .select('*')
          .eq('id', account_id)
          .eq('workspace_id', workspaceId)
          .single()
        if (error) return err(error.message)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'list_accounts',
    'List accounts with health scores, ARR, and signal counts. Supports pagination and filtering.',
    {
      page: z.number().int().positive().default(1).describe('Page number (default: 1)'),
      limit: z.number().int().min(1).max(100).default(50).describe('Results per page (default: 50, max: 100)'),
      sort_by: z.enum(['name', 'created_at']).default('created_at').describe('Sort field'),
      sort_order: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
    },
    async ({ page, limit, sort_by, sort_order }) => {
      try {
        const { data, error, count } = await admin
          .from('accounts')
          .select('*', { count: 'exact' })
          .eq('workspace_id', workspaceId)
          .order(sort_by, { ascending: sort_order === 'asc' })
          .range((page - 1) * limit, page * limit - 1)

        if (error) return err(error.message)
        return ok({ accounts: data, total: count, page, limit })
      } catch (e) { return handle(e) }
    }
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // SIGNAL TOOLS (5)
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    'list_signals',
    'List signal occurrences with optional filters. Returns detected signals with account context.',
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
        let query = admin
          .from('signals')
          .select('*', { count: 'exact' })
          .eq('workspace_id', workspaceId)
          .order('timestamp', { ascending: false })
          .range((page - 1) * limit, page * limit - 1)

        if (type) query = query.eq('type', type)
        if (source) query = query.eq('source', source)
        if (account_id) query = query.eq('account_id', account_id)
        if (start_date) query = query.gte('timestamp', start_date)
        if (end_date) query = query.lte('timestamp', end_date)

        const { data, error, count } = await query
        if (error) return err(error.message)
        return ok({ signals: data, total: count, page, limit })
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'get_signal',
    'Get detailed info for a specific signal definition including its configuration',
    { signal_id: z.string().uuid().describe('The signal definition UUID') },
    async ({ signal_id }) => {
      try {
        // signal_definitions table not in auto-generated types
        const { data, error } = await db
          .from('signal_definitions')
          .select('*')
          .eq('id', signal_id)
          .eq('workspace_id', workspaceId)
          .single()
        if (error) return err(error.message)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'create_signal',
    'Create a custom signal definition with PostHog event matching.',
    {
      name: z.string().describe('Signal display name'),
      event_name: z.string().describe('PostHog event name to match'),
      description: z.string().optional().describe('Signal description'),
      condition_operator: z.enum(['gte', 'gt', 'eq', 'lt', 'lte']).default('gte').describe('Comparison operator'),
      condition_value: z.number().nonnegative().default(1).describe('Threshold value'),
      time_window_days: z.number().int().min(1).max(365).default(7).describe('Time window in days'),
    },
    async ({ name, event_name, description, condition_operator, condition_value, time_window_days }) => {
      try {
        const { data, error } = await db
          .from('signal_definitions')
          .insert({
            workspace_id: workspaceId,
            name,
            type: 'custom',
            event_name,
            description: description ?? null,
            condition: { operator: condition_operator, value: condition_value },
            time_window: { days: time_window_days },
          })
          .select()
          .single()
        if (error) return err(error.message)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'get_signal_metrics',
    'Get computed metrics for a signal: occurrence count and date range',
    { signal_id: z.string().uuid().describe('The signal definition UUID') },
    async ({ signal_id }) => {
      try {
        // Get the signal definition (untyped table)
        const { data: def, error: defError } = await db
          .from('signal_definitions')
          .select('name, type, event_name')
          .eq('id', signal_id)
          .eq('workspace_id', workspaceId)
          .single()
        if (defError) return err(defError.message)

        // Count occurrences in the signals table
        const { count, error: countError } = await admin
          .from('signals')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('type', def.type)

        if (countError) return err(countError.message)

        return ok({
          signal: def,
          metrics: { occurrence_count: count ?? 0 },
        })
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'get_dashboard_metrics',
    'Get aggregated dashboard metrics: total accounts, signal counts, and health score distribution',
    {
      lookback_days: z.number().int().min(1).max(365).default(30).describe('Lookback period in days'),
    },
    async ({ lookback_days }) => {
      try {
        const since = new Date()
        since.setDate(since.getDate() - lookback_days)
        const sinceISO = since.toISOString()

        const [accountsResult, signalsResult, definitionsResult] = await Promise.all([
          admin
            .from('accounts')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
          admin
            .from('signals')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId)
            .gte('timestamp', sinceISO),
          db
            .from('signal_definitions')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', workspaceId),
        ])

        return ok({
          total_accounts: accountsResult.count ?? 0,
          signals_in_period: signalsResult.count ?? 0,
          signal_definitions: definitionsResult.count ?? 0,
          lookback_days,
        })
      } catch (e) { return handle(e) }
    }
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // MEMORY TOOLS (3)
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    'list_exploration_sessions',
    'List past agent exploration sessions with status',
    {
      status: z.enum(['created', 'running', 'completed', 'failed', 'closed']).optional().describe('Filter by session status'),
      limit: z.number().int().min(1).max(50).default(20).describe('Max results to return'),
    },
    async ({ status, limit }) => {
      try {
        let query = admin
          .from('workspace_agent_sessions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(limit)

        if (status) query = query.eq('status', status)

        const { data, error } = await query
        if (error) return err(error.message)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'get_eda_results',
    'Get exploratory data analysis results including join suggestions, metrics discovery, and table statistics',
    {
      table_id: z.string().optional().describe('Filter by specific table ID'),
    },
    async ({ table_id }) => {
      try {
        let query = admin
          .from('eda_results')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })

        if (table_id) query = query.eq('table_id', table_id)

        const { data, error } = await query
        if (error) return err(error.message)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'get_website_exploration',
    'Get website analysis results: B2B classification, PLG type, ICP description, pricing model',
    {},
    async () => {
      try {
        const { data, error } = await admin
          .from('website_exploration_results')
          .select('*')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (error) return err(error.message)
        if (!data) return ok({ message: 'No website exploration results found' })
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // WAREHOUSE TOOLS (2) — proxy to agent routes via internal fetch
  // ═══════════════════════════════════════════════════════════════════════════

  const agentBaseUrl = process.env.NEXT_PUBLIC_VERCEL_URL
    ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  server.tool(
    'list_warehouse_tables',
    'List all tables available in the PostHog data warehouse (native + external sources)',
    {},
    async () => {
      try {
        const secret = process.env.AGENT_API_SECRET
        if (!secret) return err('Agent API secret not configured. Warehouse tools require AGENT_API_SECRET.')

        const res = await fetch(`${agentBaseUrl}/api/agent/list-tables`, {
          headers: {
            'x-agent-secret': secret,
            'x-workspace-id': workspaceId,
          },
        })
        const data = await res.json()
        if (!res.ok) return err(data?.error || `HTTP ${res.status}`)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'get_table_columns',
    'Get the schema (columns with types) for a specific warehouse table',
    { table_name: z.string().describe('The table name to inspect') },
    async ({ table_name }) => {
      try {
        const secret = process.env.AGENT_API_SECRET
        if (!secret) return err('Agent API secret not configured. Warehouse tools require AGENT_API_SECRET.')

        const url = new URL(`${agentBaseUrl}/api/agent/list-columns`)
        url.searchParams.set('table_id', table_name)
        const res = await fetch(url.toString(), {
          headers: {
            'x-agent-secret': secret,
            'x-workspace-id': workspaceId,
          },
        })
        const data = await res.json()
        if (!res.ok) return err(data?.error || `HTTP ${res.status}`)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // JOINS TOOL (1)
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_confirmed_joins',
    'Get confirmed table join relationships discovered during agent exploration sessions',
    {},
    async () => {
      try {
        // Join suggestions are stored in eda_results.join_suggestions JSON column
        const { data, error } = await admin
          .from('eda_results')
          .select('table_id, join_suggestions, created_at')
          .eq('workspace_id', workspaceId)
          .not('join_suggestions', 'is', null)
          .order('created_at', { ascending: false })

        if (error) return err(error.message)
        return ok(data)
      } catch (e) { return handle(e) }
    }
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // MAPPING TOOLS (2)
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    'get_field_mappings',
    'Get current PostHog-to-Attio field mappings from the integration config',
    {},
    async () => {
      try {
        const { data, error } = await admin
          .from('integration_configs')
          .select('config_json')
          .eq('workspace_id', workspaceId)
          .eq('integration_name', 'attio')
          .maybeSingle()
        if (error) return err(error.message)
        if (!data) return ok({ mappings: {}, message: 'Attio integration not configured' })
        const config = data.config_json as Record<string, unknown> | null
        return ok({ mappings: config?.field_mappings ?? {} })
      } catch (e) { return handle(e) }
    }
  )

  server.tool(
    'update_field_mappings',
    'Update PostHog-to-Attio field mappings. Merges with existing config_json.',
    {
      mappings: z.record(z.string(), z.string()).describe('Map of PostHog field names to Attio attribute names'),
    },
    async ({ mappings }) => {
      try {
        const { data: existing, error: readError } = await admin
          .from('integration_configs')
          .select('id, config_json')
          .eq('workspace_id', workspaceId)
          .eq('integration_name', 'attio')
          .single()
        if (readError) return err(readError.message)

        const config = (existing.config_json as Record<string, unknown>) ?? {}
        config.field_mappings = { ...(config.field_mappings as Record<string, string> ?? {}), ...mappings }

        const { data, error } = await admin
          .from('integration_configs')
          .update({ config_json: config as unknown as import('@/lib/supabase/types').Json })
          .eq('id', existing.id)
          .select('config_json')
          .single()

        if (error) return err(error.message)
        return ok({ mappings: (data.config_json as Record<string, unknown>)?.field_mappings ?? {} })
      } catch (e) { return handle(e) }
    }
  )

  // ═══════════════════════════════════════════════════════════════════════════
  // BILLING TOOL (1)
  // ═══════════════════════════════════════════════════════════════════════════

  server.tool(
    'create_checkout_link',
    'Generate a Stripe Checkout URL for entering payment details. Returns a URL the user should open in their browser.',
    {
      success_url: z.string().url().describe('URL to redirect to after successful card entry'),
      cancel_url: z.string().url().describe('URL to redirect to if user cancels'),
    },
    async ({ success_url, cancel_url }) => {
      try {
        const { data: workspace, error: wsError } = await admin
          .from('workspaces')
          .select('stripe_customer_id')
          .eq('id', workspaceId)
          .single()
        if (wsError) return err(wsError.message)

        if (!workspace?.stripe_customer_id) {
          return err('No Stripe customer ID found for this workspace. Please set up billing first.')
        }

        const stripeKey = process.env.STRIPE_SECRET_KEY
        if (!stripeKey) return err('Stripe is not configured on this deployment.')

        const Stripe = (await import('stripe')).default
        const stripe = new Stripe(stripeKey)

        const session = await stripe.checkout.sessions.create({
          customer: workspace.stripe_customer_id,
          mode: 'setup',
          success_url,
          cancel_url,
        })

        return ok({ checkout_url: session.url })
      } catch (e) { return handle(e) }
    }
  )
}
