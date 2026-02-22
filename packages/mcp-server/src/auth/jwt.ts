/**
 * JWT validation using Supabase JWKS
 *
 * Fetches the JSON Web Key Set from Supabase's auth endpoint and validates
 * incoming Bearer tokens. Uses jose library for standards-compliant JWT
 * verification with RS256 algorithm.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'

/** Cached JWKS instance — jose handles key rotation and caching internally */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null

export interface ValidatedToken {
  sub: string // user_id
  email?: string
  iss: string
  exp: number
  raw: string // original JWT string for creating Supabase client
}

/**
 * Get or create the JWKS fetcher for Supabase.
 * createRemoteJWKSet caches keys internally with proper TTL handling.
 */
function getJWKS(): ReturnType<typeof createRemoteJWKSet> {
  if (!jwks) {
    const supabaseUrl = process.env.SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('SUPABASE_URL environment variable is required')
    }
    const jwksUrl = new URL('/auth/v1/keys', supabaseUrl)
    jwks = createRemoteJWKSet(jwksUrl)
  }
  return jwks
}

/**
 * Validate a Supabase JWT token.
 *
 * @param token - Raw JWT string (without "Bearer " prefix)
 * @returns Validated token claims
 * @throws Error if token is invalid, expired, or has wrong issuer
 */
export async function validateJWT(token: string): Promise<ValidatedToken> {
  const supabaseUrl = process.env.SUPABASE_URL
  if (!supabaseUrl) {
    throw new Error('SUPABASE_URL environment variable is required')
  }

  const expectedIssuer = `${supabaseUrl}/auth/v1`

  const { payload } = await jwtVerify(token, getJWKS(), {
    issuer: expectedIssuer,
    // Supabase uses RS256 by default
    algorithms: ['RS256'],
  })

  if (!payload.sub) {
    throw new Error('JWT missing sub claim')
  }

  return {
    sub: payload.sub,
    email: (payload as JWTPayload & { email?: string }).email,
    iss: payload.iss!,
    exp: payload.exp!,
    raw: token,
  }
}

/**
 * Extract Bearer token from Authorization header.
 *
 * @param authHeader - The Authorization header value
 * @returns The raw JWT string, or null if not a Bearer token
 */
export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }
  return authHeader.slice(7)
}

/**
 * Reset JWKS cache — useful for testing.
 */
export function resetJWKSCache(): void {
  jwks = null
}
