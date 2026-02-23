/**
 * Static registry of all MCP tools for the Methods Reference tab.
 *
 * Source of truth: packages/mcp-server/src/tools/ — update this file when tools change.
 *
 * 18 total tools: 15 read-only, 3 write/mutate
 * 7 categories: Signals, Memory, Warehouse, Joins, Mapping, Billing, Workspace
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ToolAccessType = 'read' | 'write'
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export type ToolCategory =
  | 'Signals'
  | 'Memory'
  | 'Warehouse'
  | 'Joins'
  | 'Mapping'
  | 'Billing'
  | 'Workspace'

export interface ToolParameter {
  name: string
  type: string
  required: boolean
  description: string
}

export interface McpToolDefinition {
  name: string
  description: string
  category: ToolCategory
  access: ToolAccessType
  httpMethod: HttpMethod
  parameters: ToolParameter[]
}

// ---------------------------------------------------------------------------
// Method registry
// ---------------------------------------------------------------------------

export const MCP_METHODS: McpToolDefinition[] = [
  // ─── Signals (4 read, 1 write) ──────────────────────────────────────
  {
    name: 'list_signals',
    description: 'List signals with optional filters (type, source, account, date range). Returns enriched signals with lift and confidence metrics.',
    category: 'Signals',
    access: 'read',
    httpMethod: 'GET',
    parameters: [
      { name: 'page', type: 'number', required: false, description: 'Page number (default: 1)' },
      { name: 'limit', type: 'number', required: false, description: 'Results per page, 1\u2013100 (default: 50)' },
      { name: 'type', type: 'string', required: false, description: 'Filter by signal type' },
      { name: 'source', type: 'string', required: false, description: 'Filter by source (e.g. "heuristic", "manual")' },
      { name: 'account_id', type: 'string (UUID)', required: false, description: 'Filter by account UUID' },
      { name: 'start_date', type: 'string (ISO)', required: false, description: 'Start of date range filter' },
      { name: 'end_date', type: 'string (ISO)', required: false, description: 'End of date range filter' },
    ],
  },
  {
    name: 'get_signal',
    description: 'Get detailed info for a specific signal including metrics, related signals, and account scores.',
    category: 'Signals',
    access: 'read',
    httpMethod: 'GET',
    parameters: [
      { name: 'signal_id', type: 'string (UUID)', required: true, description: 'The signal UUID' },
    ],
  },
  {
    name: 'get_signal_metrics',
    description: 'Get computed metrics (match count, lift, conversion rate, confidence) for a specific signal.',
    category: 'Signals',
    access: 'read',
    httpMethod: 'GET',
    parameters: [
      { name: 'signal_id', type: 'string (UUID)', required: true, description: 'The signal UUID' },
    ],
  },
  {
    name: 'get_dashboard_metrics',
    description: 'Get aggregated dashboard metrics: total accounts, active accounts, signal counts, ARR, health scores.',
    category: 'Signals',
    access: 'read',
    httpMethod: 'GET',
    parameters: [
      { name: 'lookback_days', type: 'number', required: false, description: 'Lookback period in days, 1\u2013365 (default: 30)' },
    ],
  },
  {
    name: 'create_signal',
    description: 'Create a custom signal definition with PostHog event matching. Metrics are calculated asynchronously.',
    category: 'Signals',
    access: 'write',
    httpMethod: 'POST',
    parameters: [
      { name: 'name', type: 'string', required: true, description: 'Signal display name' },
      { name: 'event_name', type: 'string', required: true, description: 'PostHog event name to match' },
      { name: 'description', type: 'string', required: false, description: 'Signal description' },
      { name: 'condition_operator', type: 'enum', required: false, description: 'Comparison operator: gte, gt, eq, lt, lte (default: gte)' },
      { name: 'condition_value', type: 'number', required: false, description: 'Threshold value, non-negative (default: 1)' },
      { name: 'time_window_days', type: 'number', required: false, description: 'Time window in days, 1\u2013365 (default: 7)' },
      { name: 'conversion_event', type: 'string', required: false, description: 'Optional conversion event to measure' },
    ],
  },

  // ─── Memory (3 read) ────────────────────────────────────────────────
  {
    name: 'list_exploration_sessions',
    description: 'List past agent exploration sessions with status and EDA result counts.',
    category: 'Memory',
    access: 'read',
    httpMethod: 'GET',
    parameters: [
      { name: 'status', type: 'enum', required: false, description: 'Filter by status: created, running, completed, failed, closed' },
      { name: 'limit', type: 'number', required: false, description: 'Max results, 1\u201350 (default: 20)' },
    ],
  },
  {
    name: 'get_eda_results',
    description: 'Get exploratory data analysis results including join suggestions, metrics discovery, and table statistics.',
    category: 'Memory',
    access: 'read',
    httpMethod: 'GET',
    parameters: [
      { name: 'table_id', type: 'string', required: false, description: 'Filter by specific table ID' },
    ],
  },
  {
    name: 'get_website_exploration',
    description: 'Get website analysis results: B2B classification, PLG type, ICP description, pricing model.',
    category: 'Memory',
    access: 'read',
    httpMethod: 'GET',
    parameters: [],
  },

  // ─── Warehouse (2 read) ─────────────────────────────────────────────
  {
    name: 'list_warehouse_tables',
    description: 'List all tables available in the PostHog data warehouse (native + external sources).',
    category: 'Warehouse',
    access: 'read',
    httpMethod: 'GET',
    parameters: [],
  },
  {
    name: 'get_table_columns',
    description: 'Get the schema (columns with types) for a specific warehouse table.',
    category: 'Warehouse',
    access: 'read',
    httpMethod: 'GET',
    parameters: [
      { name: 'table_name', type: 'string', required: true, description: 'The table name to inspect' },
    ],
  },

  // ─── Joins (1 read) ─────────────────────────────────────────────────
  {
    name: 'get_confirmed_joins',
    description: 'Get confirmed table join relationships discovered during agent exploration sessions.',
    category: 'Joins',
    access: 'read',
    httpMethod: 'GET',
    parameters: [],
  },

  // ─── Mapping (1 read, 1 write) ──────────────────────────────────────
  {
    name: 'get_field_mappings',
    description: 'Get current PostHog-to-Attio field mappings from the integration config.',
    category: 'Mapping',
    access: 'read',
    httpMethod: 'GET',
    parameters: [],
  },
  {
    name: 'update_field_mappings',
    description: 'Update PostHog-to-Attio field mappings. Merges with existing config.',
    category: 'Mapping',
    access: 'write',
    httpMethod: 'PUT',
    parameters: [
      { name: 'mappings', type: 'Record<string, string>', required: true, description: 'Map of PostHog field names to Attio attribute names' },
    ],
  },

  // ─── Billing (1 write) ──────────────────────────────────────────────
  {
    name: 'create_checkout_link',
    description: 'Generate a Stripe Checkout URL for entering payment details. Returns a URL the user should open in their browser.',
    category: 'Billing',
    access: 'write',
    httpMethod: 'POST',
    parameters: [
      { name: 'success_url', type: 'string (URL)', required: true, description: 'URL to redirect to after successful card entry' },
      { name: 'cancel_url', type: 'string (URL)', required: true, description: 'URL to redirect to if user cancels' },
    ],
  },

  // ─── Workspace (4 read) ─────────────────────────────────────────────
  {
    name: 'get_workspace',
    description: 'Get workspace info including setup completion status, connected integrations, and billing state.',
    category: 'Workspace',
    access: 'read',
    httpMethod: 'GET',
    parameters: [],
  },
  {
    name: 'get_integration_status',
    description: 'List all integration connection statuses (PostHog, Stripe, Attio, Apollo).',
    category: 'Workspace',
    access: 'read',
    httpMethod: 'GET',
    parameters: [],
  },
  {
    name: 'get_account_scores',
    description: 'Get health, expansion, and churn risk scores for a specific account.',
    category: 'Workspace',
    access: 'read',
    httpMethod: 'GET',
    parameters: [
      { name: 'account_id', type: 'string (UUID)', required: true, description: 'The account UUID' },
    ],
  },
  {
    name: 'list_accounts',
    description: 'List accounts with health scores, ARR, and signal counts. Supports pagination and filtering.',
    category: 'Workspace',
    access: 'read',
    httpMethod: 'GET',
    parameters: [
      { name: 'page', type: 'number', required: false, description: 'Page number (default: 1)' },
      { name: 'limit', type: 'number', required: false, description: 'Results per page, max 100 (default: 50)' },
      { name: 'status', type: 'enum', required: false, description: 'Filter: active, churned, trial' },
      { name: 'sort_by', type: 'enum', required: false, description: 'Sort: health_score, arr, name, created_at (default: health_score)' },
      { name: 'sort_order', type: 'enum', required: false, description: 'Direction: asc, desc (default: desc)' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const READ_METHODS = MCP_METHODS.filter((m) => m.access === 'read')
export const WRITE_METHODS = MCP_METHODS.filter((m) => m.access === 'write')

/** Group methods by category, preserving definition order. */
export function groupByCategory(methods: McpToolDefinition[]): Map<ToolCategory, McpToolDefinition[]> {
  const map = new Map<ToolCategory, McpToolDefinition[]>()
  for (const m of methods) {
    const group = map.get(m.category) ?? []
    group.push(m)
    map.set(m.category, group)
  }
  return map
}
