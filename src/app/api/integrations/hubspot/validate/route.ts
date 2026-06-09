/**
 * POST /api/integrations/hubspot/validate
 *
 * Validate a HubSpot Private App token and store it (encrypted) in
 * `integration_configs` on success. One HubSpot connection per workspace.
 *
 * Request:  { "token": "pat-..." }
 * Response (success): { "success": true, "message": "HubSpot connected successfully" }
 * Response (error):   { "success": false, "error": { "code": "...", "message": "..." } }
 *
 * OAuth connect (authorize/callback) is a separate follow-up; this covers the
 * Private App token path, which is a complete connection on its own.
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { createHubSpotClient, HUBSPOT_INTEGRATION_NAME, type HubSpotConfigJson } from '@/lib/integrations/hubspot'
import { encrypt } from '@/lib/crypto/encryption'
import { createModuleLogger } from '@/lib/utils/logger'
import { applyRateLimit, RATE_LIMITS } from '@/lib/utils/api-rate-limit'
import type { IntegrationConfigInsert, Json } from '@/lib/supabase/types'

const log = createModuleLogger('[HubSpot Validate]')

export async function POST(request: Request) {
  // Prevent credential-stuffing against the validation endpoint.
  const rateLimited = applyRateLimit(request, 'hubspot-validate', RATE_LIMITS.VALIDATION)
  if (rateLimited) return rateLimited

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const token = body?.token
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { success: false, error: { code: 'invalid_request', message: 'A HubSpot Private App token is required.' } },
        { status: 400 },
      )
    }

    // Validate the token by hitting HubSpot with it directly (not yet stored).
    const client = createHubSpotClient({
      token,
      authType: 'private_app',
      connectionId: membership.workspaceId,
    })

    const test = await client.testConnection()
    if (!test.success) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'invalid_token', message: test.error || 'Could not connect to HubSpot. Verify the token and its scopes.' },
        },
        { status: 401 },
      )
    }

    // Best-effort hub metadata for display (non-fatal).
    let hubId: string | null = null
    try {
      const info = await client.getAccountInfo()
      hubId = info.portalId != null ? String(info.portalId) : null
    } catch {
      // ignore — account-info scope is optional
    }

    const apiKeyEncrypted = await encrypt(token)
    const configJson: HubSpotConfigJson = { auth_type: 'private_app', hub_id: hubId }

    const configData: IntegrationConfigInsert = {
      workspace_id: membership.workspaceId,
      integration_name: HUBSPOT_INTEGRATION_NAME,
      api_key_encrypted: apiKeyEncrypted,
      project_id_encrypted: null,
      config_json: configJson as unknown as Json,
      status: 'connected',
      is_active: true,
      last_validated_at: new Date().toISOString(),
    }

    const result = await supabase
      .from('integration_configs')
      .upsert(configData as never, { onConflict: 'workspace_id,integration_name' })
      .select()
      .single()

    if (result.error) {
      log.error('Error saving HubSpot config:', result.error)
      return NextResponse.json(
        { success: false, error: { code: 'storage_error', message: 'Failed to save configuration. Please try again.' } },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, message: 'HubSpot connected successfully' })
  } catch (error) {
    log.error('Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'unknown_error', message: error instanceof Error ? error.message : 'An unexpected error occurred.' } },
      { status: 500 },
    )
  }
}
