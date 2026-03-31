/**
 * POST /api/integrations/hubspot/validate
 *
 * Validate a HubSpot Private App token, test the connection,
 * encrypt and store credentials, and create a connection row.
 *
 * Request:
 * {
 *   "token": "pat-...",
 *   "name": "My HubSpot" (optional, defaults to "HubSpot")
 * }
 *
 * Response (success):
 * {
 *   "success": true,
 *   "connection_id": "uuid",
 *   "hub_id": "12345",
 *   "account_name": "My Company"
 * }
 *
 * PATCH /api/integrations/hubspot/validate
 *
 * Update connection config (e.g., enabled_objects, sync_interval).
 *
 * Request:
 * {
 *   "connection_id": "uuid",
 *   "config": { "enabled_objects": ["contacts", "companies"] }
 * }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { validatePrivateAppToken } from '@/lib/integrations/hubspot/auth'
import { encrypt } from '@/lib/crypto/encryption'
import { HUBSPOT_API_BASE } from '@/lib/integrations/hubspot/config'
import { createModuleLogger } from '@/lib/utils/logger'
import { applyRateLimit, RATE_LIMITS } from '@/lib/utils/api-rate-limit'

const log = createModuleLogger('[HubSpot Validate]')

/**
 * Test a HubSpot API connection by fetching account info.
 */
async function testHubSpotConnection(token: string): Promise<{
  success: boolean
  hubId?: string
  hubDomain?: string
  accountName?: string
  error?: string
}> {
  try {
    const response = await fetch(`${HUBSPOT_API_BASE}/account-info/v3/details`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'Invalid token or insufficient permissions' }
      }
      if (response.status === 429) {
        return { success: false, error: 'HubSpot rate limit exceeded. Try again later.' }
      }
      return { success: false, error: `HubSpot API error: ${response.status}` }
    }

    const data = await response.json()
    return {
      success: true,
      hubId: String(data.portalId),
      hubDomain: data.uiDomain || null,
      accountName: data.accountType || null,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (message.includes('fetch') || message.includes('ECONNREFUSED')) {
      return { success: false, error: 'Unable to reach HubSpot API' }
    }
    return { success: false, error: message }
  }
}

/**
 * POST: Validate and store a Private App token
 */
export async function POST(request: Request) {
  // Rate limit: 10 validations per minute per IP
  const rateLimitResponse = applyRateLimit(request, 'hubspot-validate', RATE_LIMITS.VALIDATION)
  if (rateLimitResponse) return rateLimitResponse

  try {
    const supabase = await createClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Get workspace
    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { token, name = 'HubSpot' } = body

    // Validate token format
    const validation = validatePrivateAppToken(token)
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'invalid_token',
            message: validation.error || 'Invalid token format',
          },
        },
        { status: 400 }
      )
    }

    // Test connection to HubSpot
    const connectionTest = await testHubSpotConnection(token)
    if (!connectionTest.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'connection_failed',
            message: connectionTest.error || 'Could not connect to HubSpot',
          },
        },
        { status: 401 }
      )
    }

    // Encrypt the token
    const tokenEncrypted = await encrypt(token)

    // Upsert connection row
    const { data: connection, error: upsertError } = await supabase
      .from('hubspot_connections')
      .upsert(
        {
          workspace_id: membership.workspaceId,
          name,
          auth_type: 'private_app',
          private_app_token_encrypted: tokenEncrypted,
          hub_id: connectionTest.hubId || null,
          hub_domain: connectionTest.hubDomain || null,
          account_name: connectionTest.accountName || null,
          status: 'connected',
          is_active: true,
          is_primary: true,
          last_validated_at: new Date().toISOString(),
          last_error: null,
        } as never,
        {
          onConflict: 'workspace_id,name',
        }
      )
      .select()
      .single()

    if (upsertError) {
      log.error('Failed to save connection:', upsertError)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'storage_error',
            message: 'Failed to save connection. Please try again.',
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      connection_id: (connection as Record<string, unknown>).id,
      hub_id: connectionTest.hubId,
      account_name: connectionTest.accountName,
      message: 'HubSpot connected successfully',
    })
  } catch (error) {
    log.error('Validate error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'unknown_error',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH: Update connection configuration
 */
export async function PATCH(request: Request) {
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

    const body = await request.json()
    const { connection_id, config } = body

    if (!connection_id) {
      return NextResponse.json({ error: 'Missing connection_id' }, { status: 400 })
    }

    if (!config) {
      return NextResponse.json({ error: 'Missing config' }, { status: 400 })
    }

    const { error } = await supabase
      .from('hubspot_connections')
      .update({ config_json: config } as never)
      .eq('id', connection_id)
      .eq('workspace_id', membership.workspaceId)

    if (error) {
      log.error('Failed to update connection config:', error)
      return NextResponse.json(
        { error: 'Failed to update connection configuration' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
