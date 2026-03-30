/**
 * SSRF (Server-Side Request Forgery) prevention utilities.
 *
 * Shared validation for any server-side URL fetching — used by both
 * the agent fetch-url proxy and the Firecrawl validation endpoint.
 *
 * Note on DNS rebinding: these checks validate the literal hostname string,
 * not the resolved IP. A domain that alternates DNS responses between a public
 * IP and 127.0.0.1 could bypass these checks. This is an accepted risk here
 * because Firecrawl (the actual fetcher) runs in its own network — the SSRF
 * vector would be within Firecrawl's infra, not the Next.js server.
 *
 * For Postgres connections (which go directly from Vercel), use the
 * DNS-resolving variant in `src/lib/integrations/postgres/security.ts`.
 */

const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^\[?::1\]?$/,
  /^\[?fc[0-9a-f]{2}:/i,
  /^\[?fd[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  // IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1, ::ffff:10.0.0.1)
  /^::ffff:(127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+|169\.254\.\d+\.\d+|0\.0\.0\.0)$/i,
  /^\[?::ffff:(7f|0a|c0a8|a9fe)/i,
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
]

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',           // AWS/GCP metadata
  'metadata.google.internal',  // GCP metadata
])

/**
 * Check whether a raw hostname (not a URL) is a private/internal address.
 * Shared building block for both URL-based and raw-hostname SSRF checks.
 *
 * Returns true if the hostname should be blocked.
 */
export function isPrivateHostname(hostname: string): boolean {
  const cleaned = hostname.replace(/^\[|\]$/g, '')
  if (BLOCKED_HOSTS.has(cleaned)) return true
  return BLOCKED_HOSTNAME_PATTERNS.some(p => p.test(cleaned))
}

/**
 * Check whether a URL points to a private/internal address.
 * Returns true if the host is private (i.e. should be blocked).
 */
export function isPrivateHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr)

    // Only allow http(s) schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true
    }

    return isPrivateHostname(parsed.hostname)
  } catch {
    return true // invalid URL treated as blocked
  }
}

/**
 * Validate a URL for SSRF safety.
 * Returns an error message string if the URL is blocked, or null if valid.
 */
export function validateUrl(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return 'Invalid URL format'
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return 'Only HTTP and HTTPS protocols are allowed'
  }

  if (isPrivateHostname(parsed.hostname)) {
    if (BLOCKED_HOSTS.has(parsed.hostname.replace(/^\[|\]$/g, ''))) {
      return 'Access to this host is blocked (metadata endpoint)'
    }
    return 'Access to private/internal addresses is blocked'
  }

  return null
}
