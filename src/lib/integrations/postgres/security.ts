/**
 * Postgres Data Source Security Module
 *
 * Two concerns:
 * 1. SSRF prevention — validate hostnames AND resolved IPs before connecting
 * 2. SQL query validation — enforce read-only (SELECT/EXPLAIN only)
 */

import dns from 'dns'
import { isPrivateHostname } from '@/lib/utils/ssrf'

// ── DNS Resolution Cache ──────────────────────────────────

interface DnsCacheEntry {
  ips: string[]
  expiresAt: number
}

const DNS_CACHE = new Map<string, DnsCacheEntry>()
const DNS_CACHE_TTL_MS = 60_000 // 60 seconds

function getCachedDns(hostname: string): string[] | null {
  const entry = DNS_CACHE.get(hostname)
  if (entry && entry.expiresAt > Date.now()) return entry.ips
  if (entry) DNS_CACHE.delete(hostname)
  return null
}

function setCachedDns(hostname: string, ips: string[]): void {
  DNS_CACHE.set(hostname, { ips, expiresAt: Date.now() + DNS_CACHE_TTL_MS })
}

// ── IP Address Detection ──────────────────────────────────

const IPV4_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/
const IPV6_PATTERN = /^[0-9a-f:]+$/i

function isIpAddress(hostname: string): boolean {
  return IPV4_PATTERN.test(hostname) || IPV6_PATTERN.test(hostname)
}

// ── SSRF Validation (with DNS resolution) ─────────────────

/**
 * Validate a Postgres host for SSRF safety.
 *
 * 1. Rejects known-private hostnames (localhost, RFC1918, metadata endpoints)
 * 2. For domain names, resolves DNS and validates all resolved IPs
 * 3. Uses a 60s cache to avoid redundant DNS lookups
 *
 * Returns null if safe, or an error message string if blocked.
 */
export async function validatePostgresHost(hostname: string): Promise<string | null> {
  if (!hostname || hostname.trim().length === 0) {
    return 'Hostname is empty'
  }

  const cleaned = hostname.trim().toLowerCase()

  // Step 1: Check the hostname string itself
  if (isPrivateHostname(cleaned)) {
    return `Access to host "${cleaned}" is blocked (private/internal address)`
  }

  // Step 2: If it's a literal IP, we already checked it — done
  if (isIpAddress(cleaned)) {
    return null
  }

  // Step 3: Resolve DNS and validate resolved IPs
  const cached = getCachedDns(cleaned)
  const ips = cached ?? (await resolveDns(cleaned))

  if (!ips || ips.length === 0) {
    return `Cannot resolve hostname "${cleaned}" — DNS resolution failed`
  }

  // Cache the result
  if (!cached) setCachedDns(cleaned, ips)

  // Validate every resolved IP
  for (const ip of ips) {
    if (isPrivateHostname(ip)) {
      return `Access to host "${cleaned}" is blocked — resolves to private IP ${ip}`
    }
  }

  return null
}

async function resolveDns(hostname: string): Promise<string[] | null> {
  const ips: string[] = []
  try {
    const ipv4 = await dns.promises.resolve4(hostname)
    ips.push(...ipv4)
  } catch {
    // No A records — try AAAA only
  }
  try {
    const ipv6 = await dns.promises.resolve6(hostname)
    ips.push(...ipv6)
  } catch {
    // No AAAA records
  }
  return ips.length > 0 ? ips : null
}

// ── SQL Query Validator ───────────────────────────────────

const MAX_QUERY_LENGTH = 10_000

/**
 * Dangerous SQL keywords that modify data, schema, or server state.
 * Checked as whole words (word boundary match) to avoid false positives
 * on column names like "updated_at" or table names like "settings".
 */
const DANGEROUS_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'DROP',
  'ALTER',
  'CREATE',
  'GRANT',
  'REVOKE',
  'COPY',
  'MERGE',
  'REPLACE',
] as const

/**
 * Postgres commands that should never appear as the start of a query.
 * These are checked separately from DANGEROUS_KEYWORDS because they
 * are full commands, not keywords that could appear in SELECT contexts.
 */
const BLOCKED_COMMANDS = [
  'SET',
  'DO',
  'LISTEN',
  'NOTIFY',
  'UNLISTEN',
  'VACUUM',
  'ANALYZE',  // As a standalone command (not EXPLAIN ANALYZE)
  'REINDEX',
  'CLUSTER',
  'DISCARD',
  'RESET',
  'PREPARE',
  'EXECUTE',
  'DEALLOCATE',
  'LOCK',
  'BEGIN',
  'COMMIT',
  'ROLLBACK',
  'SAVEPOINT',
  'RELEASE',
  'CHECKPOINT',
  'REFRESH',
] as const

/**
 * Patterns for pg_ system catalog tables that expose sensitive metadata.
 * We allow information_schema (needed for schema introspection) but block
 * direct pg_catalog/pg_shadow/pg_authid access.
 */
const BLOCKED_PG_TABLE_PATTERN = /\bpg_(?:catalog\.|shadow|authid|roles|user|stat_activity|stat_replication|settings|hba_file_rules)\b/i

/**
 * Unicode fullwidth characters that should be normalized to ASCII.
 */
const UNICODE_NORMALIZATIONS: [RegExp, string][] = [
  [/\uFF1B/g, ';'],   // Fullwidth semicolon
  [/\uFF08/g, '('],   // Fullwidth left paren
  [/\uFF09/g, ')'],   // Fullwidth right paren
]

/**
 * Pattern for SQL comments.
 */
const COMMENT_PATTERNS = [
  /--.*$/gm,            // Single line comments
  /\/\*[\s\S]*?\*\//g,  // Multi-line comments
]

/**
 * Pattern to detect multiple statements (semicolon followed by non-whitespace).
 */
const MULTIPLE_STATEMENTS_PATTERN = /;\s*\S/

/**
 * Pattern to detect valid query starters: SELECT, WITH (CTE), EXPLAIN, or parenthesized SELECT.
 */
const VALID_QUERY_START = /^\s*(?:\(?\s*SELECT\s|WITH\s|EXPLAIN\s)/i

export class PostgresQueryValidator {
  /**
   * Validate a SQL query for read-only safety.
   * @throws Error if the query is blocked
   */
  validate(query: string): void {
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty')
    }

    if (query.length > MAX_QUERY_LENGTH) {
      throw new Error(
        `Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`
      )
    }

    // Unicode normalization
    let normalized = query
    for (const [pattern, replacement] of UNICODE_NORMALIZATIONS) {
      normalized = normalized.replace(pattern, replacement)
    }

    // Strip comments for analysis
    let stripped = normalized
    for (const pattern of COMMENT_PATTERNS) {
      stripped = stripped.replace(pattern, ' ')
    }
    stripped = stripped.trim()

    // Check for multiple statements
    // First, remove trailing semicolon (legitimate single-statement terminator)
    const withoutTrailingSemicolon = stripped.replace(/;\s*$/, '')
    if (MULTIPLE_STATEMENTS_PATTERN.test(withoutTrailingSemicolon)) {
      throw new Error(
        'Query contains multiple statements — only single statements are allowed'
      )
    }

    // Must start with SELECT, WITH, or EXPLAIN
    if (!VALID_QUERY_START.test(stripped)) {
      throw new Error(
        'Only SELECT, WITH (CTE), and EXPLAIN queries are allowed'
      )
    }

    // Check for dangerous keywords (whole-word match to avoid false positives)
    const dangerousFound = this.findDangerousKeywords(stripped)
    if (dangerousFound.length > 0) {
      throw new Error(
        `Query contains dangerous keywords: ${dangerousFound.join(', ')}`
      )
    }

    // Check for pg_ catalog access
    if (BLOCKED_PG_TABLE_PATTERN.test(stripped)) {
      const match = stripped.match(BLOCKED_PG_TABLE_PATTERN)
      throw new Error(
        `Access to pg_ system catalog is blocked: ${match?.[0] ?? 'pg_*'}`
      )
    }
  }

  private findDangerousKeywords(query: string): string[] {
    const found: string[] = []
    for (const keyword of DANGEROUS_KEYWORDS) {
      const pattern = new RegExp(`\\b${keyword}\\b`, 'i')
      if (pattern.test(query)) {
        found.push(keyword)
      }
    }
    return found
  }
}
