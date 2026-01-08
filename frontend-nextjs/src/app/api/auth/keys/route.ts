import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'

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
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()

    if (!memberData) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Get API keys (excluding hash for security)
    const { data: keys, error } = await supabase
      .from('api_keys')
      .select('id, name, last_used_at, expires_at, created_at')
      .eq('workspace_id', memberData.workspace_id)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching API keys:', error)
      return NextResponse.json({ error: 'Failed to fetch keys' }, { status: 500 })
    }

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
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()

    if (!memberData) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json().catch(() => ({}))
    const name = body.name || 'Default Key'

    // Generate API key: beton_<32 hex chars>
    const randomBytes = crypto.randomBytes(16).toString('hex')
    const apiKey = `${API_KEY_PREFIX}${randomBytes}`

    // Hash the key for storage
    const keyHash = await bcrypt.hash(apiKey, 10)

    // Calculate expiry date
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + API_KEY_EXPIRY_DAYS)

    // Store in database
    const { data: newKey, error } = await supabase
      .from('api_keys')
      .insert({
        workspace_id: memberData.workspace_id,
        user_id: user.id,
        key_hash: keyHash,
        name,
        expires_at: expiresAt.toISOString()
      })
      .select('id, name, expires_at, created_at')
      .single()

    if (error) {
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
