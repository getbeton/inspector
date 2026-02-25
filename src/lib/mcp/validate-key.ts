/**
 * API key validation for the embedded MCP endpoint.
 *
 * Validates `beton_xxx` API keys against the `api_keys` table using bcrypt.
 * Results are cached (keyed by SHA-256 hash) for 5 minutes to avoid
 * repeated bcrypt comparisons on every MCP message.
 *
 * Security fix:
 * - H5: O(1) lookup via key_prefix column instead of O(N) bcrypt scan
 */

import { createAdminClient } from '@/lib/supabase/admin'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export interface McpAuthContext {
  userId: string
  workspaceId: string
  keyId: string
}

// Row shape from api_keys — key_prefix added in migration 024 (not yet in generated types)
interface ApiKeyRow {
  id: string
  key_hash: string
  user_id: string
  workspace_id: string
  key_prefix?: string | null
}

// Cache keyed by SHA-256(apiKey) — never stores the plaintext key
const cache = new Map<string, McpAuthContext & { exp: number }>()
const CACHE_TTL = 5 * 60_000 // 5 minutes

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any

export async function validateApiKey(
  rawKey: string
): Promise<McpAuthContext | null> {
  if (!rawKey.startsWith('beton_')) return null

  const hash = crypto.createHash('sha256').update(rawKey).digest('hex')
  const hit = cache.get(hash)
  if (hit && hit.exp > Date.now()) {
    return { userId: hit.userId, workspaceId: hit.workspaceId, keyId: hit.keyId }
  }

  const admin = createAdminClient()
  // Cast needed: key_prefix column (migration 024) not in auto-generated types
  const db: AnyClient = admin

  // H5 fix: Try O(1) lookup by key_prefix first
  const prefix = rawKey.substring(0, 12)
  const { data: prefixKeys } = await db
    .from('api_keys')
    .select('id, key_hash, user_id, workspace_id')
    .eq('key_prefix', prefix)
    .gt('expires_at', new Date().toISOString()) as { data: ApiKeyRow[] | null }

  if (prefixKeys?.length) {
    for (const k of prefixKeys) {
      const ok = await bcrypt.compare(rawKey, k.key_hash)
      if (ok) {
        return cacheAndReturn(db, k, hash)
      }
    }
  }

  // Fallback: full scan for old keys without prefix (backward compat)
  const { data: keys } = await db
    .from('api_keys')
    .select('id, key_hash, user_id, workspace_id, key_prefix')
    .is('key_prefix', null)
    .gt('expires_at', new Date().toISOString()) as { data: ApiKeyRow[] | null }

  if (!keys?.length) return null

  for (const k of keys) {
    const ok = await bcrypt.compare(rawKey, k.key_hash)
    if (ok) {
      // Backfill the prefix for this key (fire-and-forget)
      db
        .from('api_keys')
        .update({ key_prefix: prefix })
        .eq('id', k.id)
        .then(() => {})

      return cacheAndReturn(db, k, hash)
    }
  }

  return null
}

function cacheAndReturn(
  db: AnyClient,
  k: ApiKeyRow,
  hash: string
): McpAuthContext {
  // Update last_used_at (fire-and-forget)
  db
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', k.id)
    .then(() => {})

  const ctx: McpAuthContext = {
    userId: k.user_id,
    workspaceId: k.workspace_id,
    keyId: k.id,
  }
  cache.set(hash, { ...ctx, exp: Date.now() + CACHE_TTL })
  return ctx
}
