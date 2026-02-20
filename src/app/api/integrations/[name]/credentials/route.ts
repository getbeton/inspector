import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { getIntegrationCredentials } from '@/lib/integrations/credentials'

const SUPPORTED_INTEGRATIONS = ['posthog', 'attio', 'firecrawl']

/**
 * GET /api/integrations/[name]/credentials
 * Returns decrypted credential values for a specific integration.
 * Auth-gated — only workspace members can access.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params

    if (!SUPPORTED_INTEGRATIONS.includes(name)) {
      return NextResponse.json({ error: 'Unknown integration' }, { status: 400 })
    }

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

    const credentials = await getIntegrationCredentials(membership.workspaceId, name)

    if (!credentials) {
      return NextResponse.json({
        integration: name,
        status: 'disconnected',
        credentials: null,
      })
    }

    // Mask API key — never return full secret to the browser
    const maskedKey = credentials.apiKey
      ? `${credentials.apiKey.substring(0, 8)}...${credentials.apiKey.substring(credentials.apiKey.length - 4)}`
      : null

    return NextResponse.json({
      integration: name,
      status: credentials.status,
      isActive: credentials.isActive,
      credentials: {
        apiKey: maskedKey,
        projectId: credentials.projectId,
        region: credentials.region,
        host: credentials.host,
      },
    })
  } catch (error) {
    console.error('Error in GET /api/integrations/[name]/credentials:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
