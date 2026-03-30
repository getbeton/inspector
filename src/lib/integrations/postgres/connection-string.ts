/**
 * Connection String Parser & Config Builder
 *
 * Parses PostgreSQL connection strings (postgresql:// or postgres://) into
 * individual fields for storage and display. Also builds connection configs
 * from stored data source records for use with the postgres.js driver.
 */

import type { DataSourceRecord, ParsedConnectionFields, PostgresConnectionConfig } from './types'

/**
 * Parse a PostgreSQL connection string into individual fields.
 *
 * Handles:
 * - postgresql:// and postgres:// schemes
 * - Percent-encoded passwords (e.g., special chars like @, :, /, #)
 * - IPv6 hosts (e.g., [::1])
 * - sslmode query parameter
 * - Missing optional fields (port, user, password, database)
 *
 * @throws Error if the string is not a valid postgresql:// or postgres:// URL
 */
export function parseConnectionString(connStr: string): ParsedConnectionFields {
  if (!connStr || connStr.trim().length === 0) {
    throw new Error('Connection string cannot be empty')
  }

  // postgres.js and libpq both accept postgres:// and postgresql://
  // The URL constructor doesn't natively handle postgres://, so normalize to https://
  // for parsing, then validate the original scheme.
  const trimmed = connStr.trim()

  if (!trimmed.startsWith('postgresql://') && !trimmed.startsWith('postgres://')) {
    throw new Error('Connection string must start with postgresql:// or postgres://')
  }

  // Replace scheme with https:// so URL constructor can parse it
  const normalized = trimmed.replace(/^postgres(ql)?:\/\//, 'https://')

  let parsed: URL
  try {
    parsed = new URL(normalized)
  } catch {
    throw new Error('Invalid connection string format')
  }

  // Extract fields
  const host = parsed.hostname
    ? parsed.hostname.replace(/^\[|\]$/g, '') // Strip IPv6 brackets
    : undefined

  const port = parsed.port ? parseInt(parsed.port, 10) : undefined

  // Database is the pathname without leading "/"
  const rawPath = parsed.pathname.slice(1)
  const database = rawPath.length > 0 ? rawPath : undefined

  // URL constructor does NOT auto-decode username/password — decode explicitly
  const user = parsed.username ? decodeURIComponent(parsed.username) : undefined
  const password = parsed.password ? decodeURIComponent(parsed.password) : undefined

  // Extract sslmode from query parameters
  const sslMode = parsed.searchParams.get('sslmode') ?? undefined

  return {
    host,
    port,
    database,
    user,
    password,
    sslMode,
  }
}

/**
 * Build a PostgresConnectionConfig from a stored data source record
 * and a decrypted password. Used when establishing actual connections.
 */
export function buildConnectionConfig(
  record: DataSourceRecord,
  decryptedPassword: string,
): PostgresConnectionConfig {
  return {
    host: record.host,
    port: record.port,
    database: record.database_name,
    user: record.username,
    password: decryptedPassword,
    ssl: mapSslMode(record.ssl_mode),
  }
}

/**
 * Map the stored ssl_mode string to the postgres.js ssl option.
 * - 'disable' → false (no SSL)
 * - 'require', 'prefer', 'verify-ca', 'verify-full' → passed through as string
 */
function mapSslMode(
  sslMode: string,
): PostgresConnectionConfig['ssl'] {
  if (sslMode === 'disable') return false
  if (['require', 'prefer', 'verify-ca', 'verify-full'].includes(sslMode)) {
    return sslMode as 'require' | 'prefer' | 'verify-ca' | 'verify-full'
  }
  // Default to require for unknown values
  return 'require'
}
