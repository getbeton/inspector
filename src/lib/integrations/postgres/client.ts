/**
 * Postgres Client — Read-only connection wrapper
 *
 * Uses postgres.js (the `postgres` npm package) for serverless-friendly
 * connections. Each call creates a fresh connection, executes, and disconnects.
 *
 * Security (defense in depth):
 * 1. PostgresQueryValidator blocks non-SELECT/EXPLAIN queries
 * 2. SET default_transaction_read_only = on at connection level
 * 3. statement_timeout = 30s prevents runaway queries
 *
 * Concurrency: per-data-source semaphore (max 3 concurrent connections)
 * SSRF: DNS resolution + IP validation before connecting
 */

import postgres from 'postgres'
import type {
  PostgresConnectionConfig,
  PostgresQueryResult,
  PostgresExplainResult,
  PostgresSchemaInfo,
  PostgresTableInfo,
  PostgresColumnInfo,
  PostgresTableStats,
  DataSourceRecord,
} from './types'
import { buildConnectionConfig } from './connection-string'
import { validatePostgresHost, PostgresQueryValidator } from './security'
import { acquireConnectionSlot, releaseConnectionSlot } from './concurrency'
import { decrypt } from '@/lib/crypto/encryption'

const queryValidator = new PostgresQueryValidator()

// ── Connection Lifecycle ──────────────────────────────────

/**
 * Create a postgres.js connection from config.
 * Sets read-only mode and timeouts immediately.
 */
function createConnection(config: PostgresConnectionConfig) {
  const sslConfig =
    config.ssl === false
      ? false
      : config.ssl === true || config.ssl === 'require'
        ? { rejectUnauthorized: false }
        : config.ssl === 'verify-full' || config.ssl === 'verify-ca'
          ? { rejectUnauthorized: true }
          : false

  return postgres({
    host: config.host,
    port: config.port,
    database: config.database,
    username: config.user,
    password: config.password,
    ssl: sslConfig,
    connect_timeout: 10,           // 10 seconds connect timeout
    idle_timeout: 5,               // 5 seconds idle timeout
    max: 1,                        // Single connection (no pool)
    onnotice: () => {},            // Suppress NOTICE messages
  })
}

/**
 * Execute a function with a managed Postgres connection.
 *
 * Handles: SSRF validation → semaphore acquire → connect →
 *          set read-only + timeout → execute callback → close → release
 *
 * @param dataSource - The data source record from DB
 * @param fn - Callback receiving the sql connection
 * @returns Result of the callback
 */
export async function withPostgresConnection<T>(
  dataSource: DataSourceRecord,
  fn: (sql: postgres.Sql) => Promise<T>,
): Promise<T> {
  // Step 1: SSRF validation (includes DNS resolution)
  const ssrfError = await validatePostgresHost(dataSource.host)
  if (ssrfError) {
    throw new Error(`SSRF blocked: ${ssrfError}`)
  }

  // Step 2: Decrypt password
  const password = await decrypt(dataSource.password_encrypted)
  const config = buildConnectionConfig(dataSource, password)

  // Step 3: Acquire concurrency slot
  await acquireConnectionSlot(dataSource.id)

  const sql = createConnection(config)
  try {
    // Step 4: Set read-only mode and timeouts
    await sql.unsafe('SET default_transaction_read_only = on')
    await sql.unsafe("SET statement_timeout = '30s'")
    await sql.unsafe("SET idle_in_transaction_session_timeout = '5s'")

    // Step 5: Execute the callback
    return await fn(sql)
  } finally {
    // Step 6: Always close and release
    await sql.end({ timeout: 3 }).catch(() => {})
    releaseConnectionSlot(dataSource.id)
  }
}

// ── Public API Methods ────────────────────────────────────

/**
 * Test the connection by running a simple query.
 * Returns true if successful.
 */
export async function testConnection(dataSource: DataSourceRecord): Promise<boolean> {
  await withPostgresConnection(dataSource, async (sql) => {
    await sql`SELECT 1 as ok`
  })
  return true
}

/**
 * List all schemas in the database (excluding system schemas).
 */
export async function listSchemas(
  dataSource: DataSourceRecord,
): Promise<PostgresSchemaInfo[]> {
  return withPostgresConnection(dataSource, async (sql) => {
    const rows = await sql<PostgresSchemaInfo[]>`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name NOT IN (
        'pg_catalog', 'pg_toast', 'pg_temp_1', 'pg_toast_temp_1',
        'information_schema'
      )
      ORDER BY schema_name
    `
    return rows
  })
}

/**
 * List all tables in a schema.
 */
export async function listTables(
  dataSource: DataSourceRecord,
  schema = 'public',
): Promise<PostgresTableInfo[]> {
  return withPostgresConnection(dataSource, async (sql) => {
    const rows = await sql<PostgresTableInfo[]>`
      SELECT
        t.table_name,
        t.table_schema,
        t.table_type,
        s.n_live_tup::int as estimated_row_count
      FROM information_schema.tables t
      LEFT JOIN pg_stat_user_tables s
        ON s.schemaname = t.table_schema
        AND s.relname = t.table_name
      WHERE t.table_schema = ${schema}
        AND t.table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY t.table_name
    `
    return rows
  })
}

/**
 * List all columns for a table.
 */
export async function listColumns(
  dataSource: DataSourceRecord,
  table: string,
  schema = 'public',
): Promise<PostgresColumnInfo[]> {
  return withPostgresConnection(dataSource, async (sql) => {
    const rows = await sql<PostgresColumnInfo[]>`
      SELECT
        column_name,
        data_type,
        (is_nullable = 'YES') as is_nullable,
        column_default,
        ordinal_position,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_schema = ${schema}
        AND table_name = ${table}
      ORDER BY ordinal_position
    `
    return rows
  })
}

/**
 * Execute a read-only SQL query.
 * Validates the query through PostgresQueryValidator before execution.
 */
export async function executeQuery(
  dataSource: DataSourceRecord,
  query: string,
): Promise<PostgresQueryResult> {
  // Validate query BEFORE connecting (fail fast)
  queryValidator.validate(query)

  return withPostgresConnection(dataSource, async (sql) => {
    const start = Date.now()
    const result = await sql.unsafe(query)
    const executionTimeMs = Date.now() - start

    // postgres.js returns an array-like object; extract column names from .columns
    const columns = result.columns?.map((c: { name: string }) => c.name) ?? []

    return {
      columns,
      rows: result.map((row: Record<string, unknown>) =>
        columns.map((col: string) => row[col]),
      ),
      row_count: result.length,
      execution_time_ms: executionTimeMs,
    }
  })
}

/**
 * EXPLAIN a query without executing it.
 * Returns the JSON query plan.
 */
export async function explainQuery(
  dataSource: DataSourceRecord,
  query: string,
): Promise<PostgresExplainResult> {
  // Validate the inner query
  queryValidator.validate(query)

  return withPostgresConnection(dataSource, async (sql) => {
    const start = Date.now()
    const result = await sql.unsafe(`EXPLAIN (FORMAT JSON) ${query}`)
    const executionTimeMs = Date.now() - start

    return {
      plan: result[0]?.['QUERY PLAN'] ?? result,
      execution_time_ms: executionTimeMs,
    }
  })
}

/**
 * Get table statistics (row counts and sizes) for a schema.
 */
export async function getTableStats(
  dataSource: DataSourceRecord,
  schema = 'public',
): Promise<PostgresTableStats[]> {
  return withPostgresConnection(dataSource, async (sql) => {
    const rows = await sql<PostgresTableStats[]>`
      SELECT
        relname as table_name,
        schemaname as table_schema,
        n_live_tup::int as estimated_row_count,
        pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(relname))::bigint as total_size_bytes
      FROM pg_stat_user_tables
      WHERE schemaname = ${schema}
      ORDER BY n_live_tup DESC
    `
    return rows
  })
}
