/**
 * POST /api/integrations/posthog/validate
 *
 * Validate PostHog credentials and store them encrypted on success
 *
 * Request:
 * {
 *   "api_key": "phx_...",
 *   "project_id": "12345",
 *   "region": "us" | "eu",
 *   "host": "..." (deprecated - ignored, always derived from region)
 * }
 *
 * Response (success):
 * {
 *   "success": true,
 *   "project_name": "My Project"
 * }
 *
 * Response (error):
 * {
 *   "success": false,
 *   "error": {
 *     "code": "invalid_api_key" | "project_not_found" | "rate_limited" | "network_error",
 *     "message": "User-friendly error message"
 *   }
 * }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { PostHogClient } from '@/lib/integrations/posthog/client'
import { encryptCredentials } from '@/lib/crypto/encryption'
import { getPostHogHost } from '@/lib/integrations/posthog/regions'
import { createModuleLogger } from '@/lib/utils/logger'
import type { IntegrationConfigInsert } from '@/lib/supabase/types'

const log = createModuleLogger('[PostHog Validate]')

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

  if (errorStr.includes('404') || errorStr.includes('Not Found')) {
    return {
      code: 'project_not_found',
      message: 'Project not found. Please verify your Project ID.',
      status: 404,
    }
  }

  if (errorStr.includes('429') || errorStr.includes('rate')) {
    return {
      code: 'rate_limited',
      message: 'Too many requests. Please wait a moment and try again.',
      status: 429,
    }
  }

  // Invalid response (HTML instead of JSON - usually wrong region)
  if (
    errorStr.includes('Invalid response') ||
    errorStr.includes('region') ||
    errorStr.includes('not valid JSON')
  ) {
    return {
      code: 'invalid_region',
      message: 'Invalid response from PostHog. Please verify your region (US/EU) and project ID.',
      status: 400,
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
      message: 'Unable to reach PostHog. Check your connection.',
      status: 503,
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

    log.debug('Auth check:', {
      hasUser: !!user,
      userId: user?.id?.substring(0, 8),
    })

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'not_authenticated',
            message: 'Your session has expired. Please refresh the page.',
          },
        },
        { status: 401 }
      )
    }

    // Get workspace
    const membership = await getWorkspaceMembership()
    if (!membership) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { api_key, project_id, region, host: providedHost } = body

    if (!api_key || typeof api_key !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'invalid_request',
            message: 'API key is required',
          },
        },
        { status: 400 }
      )
    }

    if (!project_id || typeof project_id !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'invalid_request',
            message: 'Project ID is required',
          },
        },
        { status: 400 }
      )
    }

    // Always derive host from region - don't trust client-provided host
    // getPostHogHost() includes the /api path needed for API calls
    const host = getPostHogHost(region)

    // Create PostHog client and test connection
    const client = new PostHogClient({
      apiKey: api_key,
      projectId: project_id,
      host,
    })

    const testResult = await client.testConnection()

    if (!testResult.success) {
      log.debug('Connection test failed:', testResult.error)
      const mapped = mapError(testResult.error || 'Connection failed')
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

    // Connection successful - encrypt and store credentials
    const { apiKeyEncrypted, projectIdEncrypted } = encryptCredentials({
      apiKey: api_key,
      projectId: project_id,
    })

    // Build configuration payload
    const configData: IntegrationConfigInsert = {
      workspace_id: membership.workspaceId,
      integration_name: 'posthog',
      api_key_encrypted: apiKeyEncrypted,
      project_id_encrypted: projectIdEncrypted,
      config_json: { region: region || 'us', host },
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
      message: 'PostHog connected successfully',
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
