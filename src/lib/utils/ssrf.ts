/**
 * SSRF (Server-Side Request Forgery) prevention utilities.
 *
 * Shared validation for any server-side URL fetching — used by both
 * the agent fetch-url proxy and the Firecrawl validation endpoint.
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
  /\.internal$/i,
  /\.local$/i,
  /\.localhost$/i,
]

const BLOCKED_HOSTS = new Set([
  '169.254.169.254',           // AWS/GCP metadata
  'metadata.google.internal',  // GCP metadata
])

/**
 * Check whether a hostname resolves to a private/internal address.
 * Returns true if the host is private (i.e. should be blocked).
 */
export function isPrivateHost(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr)

    // Only allow http(s) schemes
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return true
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '')

    if (BLOCKED_HOSTS.has(hostname)) return true

    return BLOCKED_HOSTNAME_PATTERNS.some(p => p.test(hostname))
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

  const hostname = parsed.hostname.replace(/^\[|\]$/g, '')

  if (BLOCKED_HOSTS.has(hostname)) {
    return 'Access to this host is blocked (metadata endpoint)'
  }

  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return 'Access to private/internal addresses is blocked'
    }
  }

  return null
}
