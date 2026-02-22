/**
 * POST /api/integrations/firecrawl/validate
 *
 * Dry-run validation of Firecrawl credentials — does NOT store anything.
 * Credential storage is handled by the generic POST /api/integrations/[name].
 *
 * Request:
 * {
 *   "api_key": "fc-...",
 *   "mode": "cloud" | "self_hosted",
 *   "base_url": "http://...",  (required if mode === "self_hosted")
 *   "proxy": "basic" | "stealth" | null
 * }
 *
 * Response (success):
 * { "success": true, "message": "Firecrawl connected successfully" }
 *
 * Response (error):
 * { "success": false, "error": { "code": "...", "message": "..." } }
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { createFirecrawlClient, FirecrawlAuthError, FirecrawlPaymentError, FirecrawlRateLimitError } from '@/lib/integrations/firecrawl'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'
import { createModuleLogger } from '@/lib/utils/logger'
import { applyRateLimit, RATE_LIMITS } from '@/lib/utils/api-rate-limit'
import { isPrivateHost } from '@/lib/utils/ssrf'

const log = createModuleLogger('[Firecrawl Validate]')

// ============================================
// Error mapping
// ============================================

interface ErrorMapping {
  code: string
  message: string
  status: number
}

function mapError(error: unknown): ErrorMapping {
  if (error instanceof FirecrawlAuthError) {
    return {
      code: 'invalid_api_key',
      message: 'Invalid API key. Please check your Firecrawl API key and try again.',
      status: 401,
    }
  }

  if (error instanceof FirecrawlPaymentError) {
    return {
      code: 'payment_required',
      message: 'Firecrawl credits exhausted. Please check your Firecrawl billing.',
      status: 402,
    }
  }

  if (error instanceof FirecrawlRateLimitError) {
    return {
      code: 'rate_limited',
      message: 'Firecrawl rate limit exceeded. Please wait and try again.',
      status: 429,
    }
  }

  const errorStr = String(error)

  if (
    errorStr.includes('fetch') ||
    errorStr.includes('network') ||
    errorStr.includes('ECONNREFUSED') ||
    errorStr.includes('ETIMEDOUT')
  ) {
    return {
      code: 'network_error',
      message: 'Unable to reach Firecrawl. Check your connection or self-hosted URL.',
      status: 503,
    }
  }

  return {
    code: 'unknown_error',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
    status: 500,
  }
}

// ============================================
// Route handler
// ============================================

export async function POST(request: Request) {
  const rateLimitResp = applyRateLimit(request, 'firecrawl-validate', RATE_LIMITS.VALIDATION)
  if (rateLimitResp) return rateLimitResp

  try {
    const supabase = await createClient()

    // Authenticate user
    const {
      data: { user },
    } = await supabase.auth.getUser()

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
    let { api_key } = body
    const { mode, base_url, proxy } = body

    // Resolve __use_stored__ sentinel — look up the real decrypted key
    if (api_key === '__use_stored__') {
      const credentials = await getIntegrationCredentials(membership.workspaceId, 'firecrawl')
      if (!credentials?.apiKey) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'no_stored_credentials',
              message: 'No stored Firecrawl credentials found. Please enter your API key.',
            },
          },
          { status: 400 }
        )
      }
      api_key = credentials.apiKey
    }

    // Validate API key format
    if (!api_key || typeof api_key !== 'string') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'invalid_request',
            message: 'API key is required.',
          },
        },
        { status: 400 }
      )
    }

    // Cloud API keys always start with "fc-"; self-hosted instances may use any key format
    if (mode !== 'self_hosted' && !api_key.startsWith('fc-')) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'invalid_request',
            message: 'Firecrawl API keys start with "fc-". Please check your key.',
          },
        },
        { status: 400 }
      )
    }

    // Validate self-hosted config
    if (mode === 'self_hosted') {
      if (!base_url) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'invalid_request',
              message: 'Base URL is required for self-hosted mode.',
            },
          },
          { status: 400 }
        )
      }

      if (isPrivateHost(base_url)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'invalid_base_url',
              message: 'Self-hosted URL cannot point to a private/internal address.',
            },
          },
          { status: 400 }
        )
      }
    }

    // Create client and test connection
    const client = createFirecrawlClient({
      apiKey: api_key,
      mode: mode || 'cloud',
      baseUrl: base_url,
      proxy: proxy || null,
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

    // Validation passed — credential storage is handled by
    // the generic POST /api/integrations/[name] route.
    return NextResponse.json({
      success: true,
      message: 'Firecrawl connected successfully',
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
