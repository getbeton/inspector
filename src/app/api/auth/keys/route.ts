import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type { ApiKey, ApiKeyInsert } from '@/lib/supabase/types'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { encrypt, isEncryptionKeyConfigured } from '@/lib/crypto/encryption'

const API_KEY_PREFIX = 'beton_'
const API_KEY_EXPIRY_DAYS = 90

/**
 * GET /api/auth/keys
 * List all API keys for current user's workspace
 */
export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's workspace
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Get API keys (excluding hash for security, include encrypted_key only for flag check)
    // Note: encrypted_key column added via migration 021 — cast until types regenerated
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, name, encrypted_key, last_used_at, expires_at, created_at')
      .eq('workspace_id', membership.workspaceId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false }) as {
        data: Array<{
          id: string; name: string; encrypted_key: string | null;
          last_used_at: string | null; expires_at: string; created_at: string
        }> | null
        error: unknown
      }

    if (error) {
      console.error('Error fetching API keys:', error)
      return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 })
    }

    // Map to response shape — expose has_encrypted_key flag but not the ciphertext
    const keys = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      last_used_at: row.last_used_at,
      expires_at: row.expires_at,
      created_at: row.created_at,
      has_encrypted_key: row.encrypted_key !== null,
    }))

    return NextResponse.json({ keys })
  } catch (error) {
    console.error('Error in GET /api/auth/keys:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/auth/keys
 * Generate a new API key
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get user's workspace
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const name = body.name || 'Default Key'

    // Generate API key: beton_<32 hex chars>
    const randomBytes = crypto.randomBytes(16).toString('hex')
    const apiKey = `${API_KEY_PREFIX}${randomBytes}`

    // Hash the key for storage (used for auth validation)
    const keyHash = await bcrypt.hash(apiKey, 10)

    // Encrypt the key for retrievable storage (used for MCP setup page reveal)
    let encryptedKey: string | null = null
    if (isEncryptionKeyConfigured()) {
      encryptedKey = await encrypt(apiKey)
    }

    // Calculate expiry date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + API_KEY_EXPIRY_DAYS)

    // Build insert payload
    const insertPayload: ApiKeyInsert = {
      workspace_id: membership.workspaceId,
      user_id: user.id,
      key_hash: keyHash,
      encrypted_key: encryptedKey,
      name,
      expires_at: expiresAt.toISOString()
    }

    // Store in database
    const { data, error } = await supabase
      .from('api_keys')
      .insert(insertPayload as never)
      .select('id, name, expires_at, created_at')
      .single()

    const newKey = data as Pick<ApiKey, 'id' | 'name' | 'expires_at' | 'created_at'> | null

    if (error || !newKey) {
      console.error('Error creating API key:', error)
      return NextResponse.json({ error: 'Failed to create key' }, { status: 500 })
    }

    // Return the key only once (it cannot be retrieved later)
    return NextResponse.json({
      key: apiKey,
      id: newKey.id,
      name: newKey.name,
      expires_at: newKey.expires_at,
      created_at: newKey.created_at,
      message: 'Save this key - it cannot be retrieved again'
    })
  } catch (error) {
    console.error('Error in POST /api/auth/keys:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
