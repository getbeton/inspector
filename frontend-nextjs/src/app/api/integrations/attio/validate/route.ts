/**
 * POST /api/integrations/attio/validate
 *
 * Validate Attio credentials and store them encrypted on success
 *
 * Request:
 * {
 *   "api_key": "attio_..."
 * }
 *
 * Response (success):
 * {
 *   "success": true,
 *   "workspace_name": "My Workspace"
 * }
 *
 * Response (error):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "invalid_api_key" | "rate_limited" | "network_error",
 *     "message": "User-friendly error message"
 *   }
 * }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { validateConnection } from '@/lib/integrations/attio/client'
import { encryptCredentials } from '@/lib/crypto/encryption'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAttioApiKey } from '@/lib/integrations/validation'
import type { IntegrationConfigInsert } from '@/lib/supabase/types'

const log = createModuleLogger('[Attio Validate]')

/**
 * Error code mapping based on HTTP status and error types
 */
interface ErrorMapping {
  code: string
  message: string
  status: number
}

function mapError(error: unknown): ErrorMapping {
  const errorStr = String(error)

  // Check for specific HTTP status codes
  if (errorStr.includes('401') || errorStr.includes('Unauthorized')) {
    return {
      code: 'invalid_api_key',
      message: 'Invalid API key. Please check and try again.',
      status: 401,
    }
  }

  if (errorStr.includes('403') || errorStr.includes('Forbidden')) {
    return {
      code: 'invalid_api_key',
      message: 'Access denied. Please verify your API key has the required permissions.',
      status: 403,
    }
  }

  if (errorStr.includes('429') || errorStr.includes('rate')) {
    return {
      code: 'rate_limited',
      message: 'Too many requests. Please wait a moment and try again.',
      status: 429,
    }
  }

  // Network errors
  if (
    errorStr.includes('fetch') ||
    errorStr.includes('network') ||
    errorStr.includes('ECONNREFUSED') ||
    errorStr.includes('ETIMEDOUT')
  ) {
    return {
      code: 'network_error',
      message: 'Unable to reach Attio. Check your connection.',
      status: 503,
    }
  }

  // Attio-specific errors
  if (errorStr.includes('AttioAuth') || errorStr.includes('authentication')) {
    return {
      code: 'invalid_api_key',
      message: 'Invalid API key. Please check and try again.',
      status: 401,
    }
  }

  // Default unknown error
  return {
    code: 'unknown_error',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    status: 500,
  }
}

export async function POST(request: Request) {
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
    const { api_key } = body

    // Validate API key format before making API calls
    const validation = validateAttioApiKey(api_key)
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'invalid_request',
            message: validation.error || 'Invalid API key format',
          },
        },
        { status: 400 }
      )
    }

    // Validate connection to Attio
    let validationResult
    try {
      validationResult = await validateConnection(api_key)
    } catch (error) {
      const mapped = mapError(error)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: mapped.code,
            message: mapped.message,
          },
        },
        { status: mapped.status }
      )
    }

    if (!validationResult.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'invalid_api_key',
            message: 'Could not connect to Attio. Please verify your API key.',
          },
        },
        { status: 401 }
      )
    }

    // Connection successful - encrypt and store credentials
    const { apiKeyEncrypted } = encryptCredentials({
      apiKey: api_key,
    })

    // Check if config exists
    // Build configuration payload
    const configData: IntegrationConfigInsert = {
      workspace_id: membership.workspaceId,
      integration_name: 'attio',
      api_key_encrypted: apiKeyEncrypted,
      project_id_encrypted: null,
      config_json: {
        workspace_id: validationResult.workspaceId,
        workspace_name: validationResult.workspaceName,
        user_email: validationResult.userEmail,
      },
      status: 'connected',
      is_active: true,
      last_validated_at: new Date().toISOString(),
    }

    // Use upsert to avoid race condition between concurrent requests.
    // The unique constraint on (workspace_id, integration_name) ensures only one
    // config per workspace per integration, and upsert handles insert vs update atomically.
    const result = await supabase
      .from('integration_configs')
      .upsert(configData as never, {
        onConflict: 'workspace_id,integration_name',
      })
      .select()
      .single()

    if (result.error) {
      log.error('Error saving config:', result.error)
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'storage_error',
            message: 'Failed to save configuration. Please try again.',
          },
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      workspace_name: validationResult.workspaceName,
      message: 'Attio connected successfully',
    })
  } catch (error) {
    log.error('Unexpected error:', error)
    const mapped = mapError(error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: mapped.code,
          message: mapped.message,
        },
      },
      { status: mapped.status }
    )
  }
}
