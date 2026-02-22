import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type { IntegrationConfig, IntegrationConfigInsert, Json } from '@/lib/supabase/types'
import { encryptCredentials } from '@/lib/crypto/encryption'
import { SUPPORTED_INTEGRATIONS } from '@/lib/integrations/supported'
import { isPrivateHost } from '@/lib/utils/ssrf'

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
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Get integration config
    const { data, error } = await supabase
      .from('integration_configs')
      .select('*')
      .eq('workspace_id', membership.workspaceId)
      .eq('integration_name', name)
      .single()

    const config = data as IntegrationConfig | null

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
        ...(config.config_json as Record<string, Json>),
        api_key: maskedKey
      }
    })
  } catch (error) {
    console.error('Error in GET /api/integrations/[name]:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ============================================
// Per-integration input validation
// ============================================

/**
 * Run integration-specific input checks before persisting.
 * Returns an error string if validation fails, or null if OK.
 */
function validateIntegrationInput(
  name: string,
  body: Record<string, unknown>
): string | null {
  const { mode, base_url } = body as { mode?: string; base_url?: string }

  // Common: any self-hosted integration must provide a valid, non-private base_url
  if (mode === 'self_hosted') {
    if (!base_url) {
      return 'Instance URL is required for self-hosted mode.'
    }
    if (isPrivateHost(base_url)) {
      return 'Instance URL cannot point to a private/internal address.'
    }
  }

  // Firecrawl-specific: cloud API keys must start with "fc-"
  if (name === 'firecrawl') {
    const api_key = body.api_key as string | undefined
    if (mode !== 'self_hosted' && api_key && !api_key.startsWith('fc-')) {
      return 'Firecrawl cloud API keys start with "fc-". Please check your key.'
    }
  }

  return null
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
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const body = await request.json()
    const { api_key, project_id, region, host, ...otherConfig } = body

    if (!api_key) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 })
    }

    // Per-integration input validation (SSRF, key format, etc.)
    const validationError = validateIntegrationInput(name, body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    // Encrypt sensitive credentials (async to avoid blocking event loop)
    const { apiKeyEncrypted, projectIdEncrypted } = await encryptCredentials({
      apiKey: api_key,
      projectId: project_id
    })

    // Check if config exists
    const { data: existingData } = await supabase
      .from('integration_configs')
      .select('id')
      .eq('workspace_id', membership.workspaceId)
      .eq('integration_name', name)
      .single()

    const existing = existingData as { id: string } | null

    // Build configuration payload with encrypted credentials
    // Store only non-sensitive metadata in config_json (region, host)
    const configData: IntegrationConfigInsert = {
      workspace_id: membership.workspaceId,
      integration_name: name,
      api_key_encrypted: apiKeyEncrypted,
      // Only store project_id_encrypted when a project_id was actually provided
      ...(projectIdEncrypted != null && { project_id_encrypted: projectIdEncrypted }),
      config_json: { region, host, ...otherConfig },
      status: 'validating',
      is_active: true
    }

    let result
    if (existing) {
      result = await supabase
        .from('integration_configs')
        // @ts-expect-error — Supabase PostgREST narrows .update() param to `never`; configData shape is manually verified as IntegrationConfigInsert
        .update(configData)
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      result = await supabase
        .from('integration_configs')
        // @ts-expect-error — Supabase PostgREST narrows .insert() param to `never`; configData shape is manually verified as IntegrationConfigInsert
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
    const membership = await getWorkspaceMembership()

    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Delete config
    const { error } = await supabase
      .from('integration_configs')
      .delete()
      .eq('workspace_id', membership.workspaceId)
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
