import type { ExplorationSession, JoinPair } from '@/lib/api/explorations'
import type { EdaResult, WebsiteExplorationResult, TableColumnsResponse } from '@/lib/agent/types'

// ─── Mock Sessions ───

const MOCK_WORKSPACE_ID = 'ws_demo_000'

const CONFIRMED_JOINS: JoinPair[] = [
  { table1: 'events', col1: 'distinct_id', table2: 'persons', col2: 'id' },
  { table1: 'events', col1: 'distinct_id', table2: 'sessions', col2: 'distinct_id' },
  { table1: 'sessions', col1: 'session_id', table2: 'session_recordings', col2: 'session_id' },
]

export const MOCK_SESSIONS: ExplorationSession[] = [
  {
    id: 'uuid-001',
    session_id: 'uuid-001',
    workspace_id: MOCK_WORKSPACE_ID,
    agent_app_name: 'upsell_agent',
    status: 'completed',
    error_message: null,
    confirmed_joins: CONFIRMED_JOINS,
    created_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    started_at: new Date(Date.now() - 2 * 60 * 60_000 + 5_000).toISOString(),
    completed_at: new Date(Date.now() - 2 * 60 * 60_000 + 185_000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60_000 + 185_000).toISOString(),
    eda_count: 5,
    has_website_result: true,
  },
  {
    id: 'uuid-002',
    session_id: 'uuid-002',
    workspace_id: MOCK_WORKSPACE_ID,
    agent_app_name: 'upsell_agent',
    status: 'running',
    error_message: null,
    confirmed_joins: null,
    created_at: new Date(Date.now() - 10 * 60_000).toISOString(),
    started_at: new Date(Date.now() - 10 * 60_000 + 3_000).toISOString(),
    completed_at: null,
    updated_at: new Date(Date.now() - 60_000).toISOString(),
    eda_count: 2,
    has_website_result: false,
  },
  {
    id: 'uuid-003',
    session_id: 'uuid-003',
    workspace_id: MOCK_WORKSPACE_ID,
    agent_app_name: 'upsell_agent',
    status: 'failed',
    error_message: 'PostHog API rate limit exceeded after 42 queries',
    confirmed_joins: null,
    created_at: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
    started_at: new Date(Date.now() - 26 * 60 * 60_000 + 4_000).toISOString(),
    completed_at: new Date(Date.now() - 26 * 60 * 60_000 + 92_000).toISOString(),
    updated_at: new Date(Date.now() - 26 * 60 * 60_000 + 92_000).toISOString(),
    eda_count: 1,
    has_website_result: true,
  },
  {
    id: 'uuid-004',
    session_id: 's_stu901vwx234',
    workspace_id: MOCK_WORKSPACE_ID,
    agent_app_name: 'upsell_agent',
    status: 'completed',
    error_message: null,
    confirmed_joins: [
      { table1: 'events', col1: 'distinct_id', table2: 'persons', col2: 'id' },
    ],
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
    started_at: new Date(Date.now() - 3 * 24 * 60 * 60_000 + 6_000).toISOString(),
    completed_at: new Date(Date.now() - 3 * 24 * 60 * 60_000 + 210_000).toISOString(),
    updated_at: new Date(Date.now() - 3 * 24 * 60 * 60_000 + 210_000).toISOString(),
    eda_count: 4,
    has_website_result: true,
  },
]

// ─── Mock EDA Results (keyed by session_id) ───

const EVENTS_COLUMNS = [
  { col_name: 'uuid', col_type: 'UUID' },
  { col_name: 'event', col_type: 'String' },
  { col_name: 'distinct_id', col_type: 'String' },
  { col_name: 'timestamp', col_type: 'DateTime' },
  { col_name: 'properties', col_type: 'String' },
  { col_name: '$current_url', col_type: 'String' },
  { col_name: '$browser', col_type: 'String' },
  { col_name: '$os', col_type: 'String' },
]

const PERSONS_COLUMNS = [
  { col_name: 'id', col_type: 'UUID' },
  { col_name: 'created_at', col_type: 'DateTime' },
  { col_name: 'properties', col_type: 'String' },
  { col_name: 'is_identified', col_type: 'Boolean' },
]

const SESSIONS_COLUMNS = [
  { col_name: 'session_id', col_type: 'String' },
  { col_name: 'distinct_id', col_type: 'String' },
  { col_name: 'min_timestamp', col_type: 'DateTime' },
  { col_name: 'max_timestamp', col_type: 'DateTime' },
  { col_name: 'duration', col_type: 'UInt64' },
  { col_name: 'pageview_count', col_type: 'UInt32' },
  { col_name: 'event_count', col_type: 'UInt32' },
]

const GROUPS_COLUMNS = [
  { col_name: 'group_type_index', col_type: 'UInt8' },
  { col_name: 'group_key', col_type: 'String' },
  { col_name: 'group_properties', col_type: 'String' },
  { col_name: 'created_at', col_type: 'DateTime' },
]

const SESSION_RECORDINGS_COLUMNS = [
  { col_name: 'session_id', col_type: 'String' },
  { col_name: 'distinct_id', col_type: 'String' },
  { col_name: 'start_time', col_type: 'DateTime' },
  { col_name: 'end_time', col_type: 'DateTime' },
  { col_name: 'click_count', col_type: 'UInt32' },
  { col_name: 'keypress_count', col_type: 'UInt32' },
  { col_name: 'active_seconds', col_type: 'UInt32' },
]

export const MOCK_EDA_RESULTS: Record<string, EdaResult[]> = {
  'uuid-001': [
    {
      id: 'eda-001',
      workspace_id: MOCK_WORKSPACE_ID,
      table_id: 'events',
      join_suggestions: [
        { table1: 'events', col1: 'distinct_id', table2: 'persons', col2: 'id' },
        { table1: 'events', col1: 'distinct_id', table2: 'sessions', col2: 'distinct_id' },
      ],
      metrics_discovery: [
        { name: 'Daily Active Users', description: 'COUNT(DISTINCT distinct_id) per day', tables: ['events'] },
        { name: 'Feature Adoption Rate', description: 'Users who triggered feature events / total users', tables: ['events', 'persons'] },
        { name: 'Event Volume', description: 'Total events per day trending over time', tables: ['events'] },
      ],
      table_stats: {
        total_rows: 4_832_150,
        total_bytes: 2_147_483_648,
        engine: 'ReplacingMergeTree',
        columns: EVENTS_COLUMNS,
      },
      summary_text: 'Core event stream with 4.8M rows. Contains pageview, identify, and custom events. High cardinality on distinct_id (~28K unique users). Joinable to persons and sessions via distinct_id.',
      updated_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    },
    {
      id: 'eda-002',
      workspace_id: MOCK_WORKSPACE_ID,
      table_id: 'persons',
      join_suggestions: [
        { table1: 'persons', col1: 'id', table2: 'events', col2: 'distinct_id' },
      ],
      metrics_discovery: [
        { name: 'User Growth Rate', description: 'New persons created per week', tables: ['persons'] },
        { name: 'Identified User Ratio', description: 'is_identified=true / total persons', tables: ['persons'] },
      ],
      table_stats: {
        total_rows: 28_432,
        total_bytes: 15_728_640,
        engine: 'ReplacingMergeTree',
        columns: PERSONS_COLUMNS,
      },
      summary_text: 'Person/user dimension table with 28K records. Properties contain enriched user data including email, company, plan. 72% are identified users.',
      updated_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    },
    {
      id: 'eda-003',
      workspace_id: MOCK_WORKSPACE_ID,
      table_id: 'sessions',
      join_suggestions: [
        { table1: 'sessions', col1: 'distinct_id', table2: 'events', col2: 'distinct_id' },
        { table1: 'sessions', col1: 'session_id', table2: 'session_recordings', col2: 'session_id' },
      ],
      metrics_discovery: [
        { name: 'Avg Session Duration', description: 'Mean session length in seconds', tables: ['sessions'] },
        { name: 'Pages Per Session', description: 'Average pageview_count across sessions', tables: ['sessions'] },
      ],
      table_stats: {
        total_rows: 156_200,
        total_bytes: 52_428_800,
        engine: 'MergeTree',
        columns: SESSIONS_COLUMNS,
      },
      summary_text: 'Session aggregation table with 156K sessions. Median duration 4m32s, avg 6.2 pageviews per session. Good proxy for engagement scoring.',
      updated_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    },
    {
      id: 'eda-004',
      workspace_id: MOCK_WORKSPACE_ID,
      table_id: 'groups',
      join_suggestions: [],
      metrics_discovery: [
        { name: 'Company Count', description: 'Distinct group_key count for type=0 (organization)', tables: ['groups'] },
      ],
      table_stats: {
        total_rows: 3_210,
        total_bytes: 1_048_576,
        engine: 'ReplacingMergeTree',
        columns: GROUPS_COLUMNS,
      },
      summary_text: 'Group analytics table with 3.2K organization records. Useful for account-level aggregation when joined via person properties.',
      updated_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    },
    {
      id: 'eda-005',
      workspace_id: MOCK_WORKSPACE_ID,
      table_id: 'session_recordings',
      join_suggestions: [
        { table1: 'session_recordings', col1: 'session_id', table2: 'sessions', col2: 'session_id' },
      ],
      metrics_discovery: [],
      table_stats: {
        total_rows: 89_500,
        total_bytes: 31_457_280,
        engine: 'MergeTree',
        columns: SESSION_RECORDINGS_COLUMNS,
      },
      summary_text: 'Session recording metadata for 89.5K recordings. Tracks click/keypress counts and active time. Joinable to sessions via session_id.',
      updated_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    },
  ],
  'uuid-002': [
    {
      id: 'eda-006',
      workspace_id: MOCK_WORKSPACE_ID,
      table_id: 'events',
      join_suggestions: [],
      metrics_discovery: [
        { name: 'Daily Active Users', description: 'COUNT(DISTINCT distinct_id) per day', tables: ['events'] },
      ],
      table_stats: {
        total_rows: 4_832_150,
        total_bytes: 2_147_483_648,
        engine: 'ReplacingMergeTree',
        columns: EVENTS_COLUMNS,
      },
      summary_text: 'Analysis in progress — initial scan of events table complete.',
      updated_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    },
    {
      id: 'eda-007',
      workspace_id: MOCK_WORKSPACE_ID,
      table_id: 'persons',
      join_suggestions: [],
      metrics_discovery: [],
      table_stats: {
        total_rows: 28_432,
        total_bytes: 15_728_640,
        engine: 'ReplacingMergeTree',
        columns: PERSONS_COLUMNS,
      },
      summary_text: 'Scanning persons table...',
      updated_at: new Date(Date.now() - 3 * 60_000).toISOString(),
    },
  ],
  'uuid-003': [
    {
      id: 'eda-008',
      workspace_id: MOCK_WORKSPACE_ID,
      table_id: 'events',
      join_suggestions: [],
      metrics_discovery: [],
      table_stats: {
        total_rows: 4_832_150,
        total_bytes: 2_147_483_648,
        engine: 'ReplacingMergeTree',
        columns: EVENTS_COLUMNS,
      },
      summary_text: 'Partial scan before rate limit. 8 of 42 columns analyzed.',
      updated_at: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
    },
  ],
}

// ─── Mock Website Results (keyed by session_id) ───

export const MOCK_WEBSITE_RESULTS: Record<string, WebsiteExplorationResult> = {
  'uuid-001': {
    id: 'web-001',
    workspace_id: MOCK_WORKSPACE_ID,
    is_b2b: true,
    plg_type: 'hybrid',
    website_url: 'https://acme-analytics.com',
    product_assumptions: [
      'Self-serve signup with free tier',
      'Collaboration features drive expansion',
      'Usage-based pricing at scale',
      'API access as premium feature',
    ],
    icp_description: 'Mid-market B2B SaaS companies (50-500 employees) with product and data teams who need real-time product analytics.',
    product_description: 'Acme Analytics is a product analytics platform that helps teams understand user behavior through event tracking, session replay, and funnel analysis. It offers self-serve onboarding with a generous free tier and scales through usage-based pricing.',
    pricing_model: {
      model: 'usage_based',
      free_tier: true,
      tiers: [
        { name: 'Free', limit: '1M events/mo', price: 0 },
        { name: 'Growth', limit: '10M events/mo', price: 450 },
        { name: 'Enterprise', limit: 'Unlimited', price: 'Custom' },
      ],
    },
    updated_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
  },
  'uuid-003': {
    id: 'web-002',
    workspace_id: MOCK_WORKSPACE_ID,
    is_b2b: true,
    plg_type: 'plg',
    website_url: 'https://acme-analytics.com',
    product_assumptions: ['Self-serve signup'],
    icp_description: 'B2B SaaS companies',
    product_description: 'Product analytics platform (partial analysis)',
    pricing_model: null,
    updated_at: new Date(Date.now() - 26 * 60 * 60_000).toISOString(),
  },
}

// ─── Mock Column Data (keyed by table_id) ───

export const MOCK_TABLE_COLUMNS: Record<string, TableColumnsResponse> = {
  events: {
    table_id: 'events',
    columns: EVENTS_COLUMNS.map(c => ({ ...c, col_id: c.col_name, examples: [] })),
  },
  persons: {
    table_id: 'persons',
    columns: PERSONS_COLUMNS.map(c => ({ ...c, col_id: c.col_name, examples: [] })),
  },
  sessions: {
    table_id: 'sessions',
    columns: SESSIONS_COLUMNS.map(c => ({ ...c, col_id: c.col_name, examples: [] })),
  },
  groups: {
    table_id: 'groups',
    columns: GROUPS_COLUMNS.map(c => ({ ...c, col_id: c.col_name, examples: [] })),
  },
  session_recordings: {
    table_id: 'session_recordings',
    columns: SESSION_RECORDINGS_COLUMNS.map(c => ({ ...c, col_id: c.col_name, examples: [] })),
  },
}
