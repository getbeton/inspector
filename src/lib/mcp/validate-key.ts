/**
 * API key validation for the embedded MCP endpoint.
 *
 * Validates `beton_xxx` API keys against the `api_keys` table using bcrypt.
 * Results are cached (keyed by SHA-256 hash) for 5 minutes to avoid
 * repeated bcrypt comparisons on every MCP message.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

export interface McpAuthContext {
  userId: string
  workspaceId: string
  keyId: string
}

// Cache keyed by SHA-256(apiKey) — never stores the plaintext key
const cache = new Map<string, McpAuthContext & { exp: number }>()
const CACHE_TTL = 5 * 60_000 // 5 minutes

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
  const { data: keys } = await admin
    .from('api_keys')
    .select('id, key_hash, user_id, workspace_id')
    .gt('expires_at', new Date().toISOString())

  if (!keys?.length) return null

  // bcrypt.compare in parallel — acceptable for small key counts
  const results = await Promise.all(
    keys.map(async (k) => ({
      ok: await bcrypt.compare(rawKey, k.key_hash),
      keyId: k.id as string,
      userId: k.user_id as string,
      workspaceId: k.workspace_id as string,
    }))
  )

  const match = results.find((r) => r.ok)
  if (!match) return null

  // Update last_used_at (fire-and-forget)
  admin
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', match.keyId)
    .then(() => {})

  const ctx: McpAuthContext = {
    userId: match.userId,
    workspaceId: match.workspaceId,
    keyId: match.keyId,
  }
  cache.set(hash, { ...ctx, exp: Date.now() + CACHE_TTL })
  return ctx
}
