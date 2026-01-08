import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SUPPORTED_INTEGRATIONS = ['posthog', 'stripe', 'attio', 'apollo']

/**
 * GET /api/integrations/[name]
 * Get configuration for a specific integration (masked API key)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const supabase = await createClient()

    if (!SUPPORTED_INTEGRATIONS.includes(name)) {
      return NextResponse.json({ error: 'Unknown integration' }, { status: 400 })
    }

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

    // Get integration config
    const { data: config, error } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('workspace_id', memberData.workspace_id)
      .eq('integration_name', name)
      .single()

    if (error || !config) {
      return NextResponse.json({
        integration: name,
        status: 'disconnected',
        is_configured: false
      })
    }

    // Mask API key
    const maskedKey = config.api_key_encrypted
      ? `${config.api_key_encrypted.substring(0, 8)}...${config.api_key_encrypted.substring(config.api_key_encrypted.length - 4)}`
      : null

    return NextResponse.json({
      integration: name,
      status: config.status,
      is_configured: true,
      is_active: config.is_active,
      last_validated_at: config.last_validated_at,
      config: {
        ...config.config_json,
        api_key: maskedKey
      }
    })
  } catch (error) {
    console.error('Error in GET /api/integrations/[name]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/integrations/[name]
 * Save or update integration configuration
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const supabase = await createClient()

    if (!SUPPORTED_INTEGRATIONS.includes(name)) {
      return NextResponse.json({ error: 'Unknown integration' }, { status: 400 })
    }

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

    const body = await request.json()
    const { api_key, ...configJson } = body

    if (!api_key) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    // Check if config exists
    const { data: existing } = await supabase
      .from('integration_configs')
      .select('id')
      .eq('workspace_id', memberData.workspace_id)
      .eq('integration_name', name)
      .single()

    // Upsert configuration
    const configData = {
      workspace_id: memberData.workspace_id,
      integration_name: name,
      api_key_encrypted: api_key, // Note: In production, encrypt before storing
      config_json: configJson,
      status: 'validating' as const,
      is_active: true
    }

    let result
    if (existing) {
      result = await supabase
        .from('integration_configs')
        .update(configData)
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('integration_configs')
        .insert(configData)
        .select()
        .single()
    }

    if (result.error) {
      console.error('Error saving integration config:', result.error)
      return NextResponse.json({ error: 'Failed to save configuration' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      integration: name,
      status: 'validating',
      message: 'Configuration saved. Run /api/integrations/[name]/test to validate.'
    })
  } catch (error) {
    console.error('Error in POST /api/integrations/[name]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * DELETE /api/integrations/[name]
 * Remove integration configuration
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params
    const supabase = await createClient()

    if (!SUPPORTED_INTEGRATIONS.includes(name)) {
      return NextResponse.json({ error: 'Unknown integration' }, { status: 400 })
    }

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

    // Delete config
    const { error } = await supabase
      .from('integration_configs')
      .delete()
      .eq('workspace_id', memberData.workspace_id)
      .eq('integration_name', name)

    if (error) {
      console.error('Error deleting integration config:', error)
      return NextResponse.json({ error: 'Failed to delete configuration' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in DELETE /api/integrations/[name]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
