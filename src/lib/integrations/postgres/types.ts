/**
 * Types for the Postgres data source integration.
 *
 * Covers: connection configuration, DB row shapes, query results,
 * and schema introspection results.
 */

// ── Connection Config ─────────────────────────────────────

export interface PostgresConnectionConfig {
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl: boolean | 'require' | 'prefer' | 'disable' | 'verify-ca' | 'verify-full'
}

/**
 * Parsed fields from a connection string, before any defaults are applied.
 * Fields may be undefined if not present in the connection string.
 */
export interface ParsedConnectionFields {
  host?: string
  port?: number
  database?: string
  user?: string
  password?: string
  sslMode?: string
}

// ── Database Row Shape ────────────────────────────────────

export type DataSourceStatus = 'pending' | 'connected' | 'error' | 'disconnected'

export interface DataSourceRecord {
  id: string
  workspace_id: string
  source_type: string
  name: string
  host: string
  port: number
  database_name: string
  username: string
  password_encrypted: string
  ssl_mode: string
  config_json: Record<string, unknown>
  status: DataSourceStatus
  last_validated_at: string | null
  last_error: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/**
 * Public-facing data source (password masked, never returned to clients).
 */
export type DataSourcePublic = Omit<DataSourceRecord, 'password_encrypted'> & {
  password_masked: string
}

// ── Query Results ─────────────────────────────────────────

export interface PostgresQueryResult {
  columns: string[]
  rows: unknown[][]
  row_count: number
  execution_time_ms: number
}

export interface PostgresExplainResult {
  plan: unknown
  execution_time_ms: number
}

// ── Schema Introspection ──────────────────────────────────

export interface PostgresSchemaInfo {
  schema_name: string
}

export interface PostgresTableInfo {
  table_name: string
  table_schema: string
  table_type: string // 'BASE TABLE', 'VIEW', etc.
  estimated_row_count: number | null
}

export interface PostgresColumnInfo {
  column_name: string
  data_type: string
  is_nullable: boolean
  column_default: string | null
  ordinal_position: number
  character_maximum_length: number | null
}

export interface PostgresTableStats {
  table_name: string
  table_schema: string
  estimated_row_count: number
  total_size_bytes: number | null
}

// ── API Request/Response Shapes ───────────────────────────

export interface CreateDataSourceRequest {
  name: string
  host: string
  port?: number
  database_name: string
  username: string
  password: string
  ssl_mode?: string
  config_json?: Record<string, unknown>
}

export interface UpdateDataSourceRequest {
  name?: string
  host?: string
  port?: number
  database_name?: string
  username?: string
  password?: string
  ssl_mode?: string
  config_json?: Record<string, unknown>
}
