import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type { IntegrationConfig, Json } from '@/lib/supabase/types'

type IntegrationRow = Pick<IntegrationConfig, 'id' | 'integration_name' | 'status' | 'last_validated_at' | 'is_active' | 'config_json' | 'created_at' | 'updated_at'>

/**
 * GET /api/integrations
 * List all integrations status for current workspace
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

    // Get all integration configs
    const { data, error } = await supabase
      .from('integration_configs')
      .select(`
        id,
        integration_name,
        status,
        last_validated_at,
        is_active,
        config_json,
        created_at,
        updated_at
      `)
      .eq('workspace_id', membership.workspaceId)

    const integrations = data as IntegrationRow[] | null

    if (error) {
      console.error('Error fetching integrations:', error)
      return NextResponse.json({ error: 'Failed to fetch integrations' }, { status: 500 })
    }

    // Define all supported integrations
    const supportedIntegrations = ['posthog', 'stripe', 'attio', 'apollo']

    // Build status map
    const integrationStatus = supportedIntegrations.map((name) => {
      const config = integrations?.find((i) => i.integration_name === name)
      return {
        name,
        status: config?.status || 'disconnected',
        is_configured: !!config,
        is_active: config?.is_active || false,
        last_validated_at: config?.last_validated_at || null,
        config: config
          ? {
              // Only include non-sensitive config
              ...(config.config_json as Record<string, Json>),
              has_api_key: true
            }
          : null
      }
    })

    return NextResponse.json({ integrations: integrationStatus })
  } catch (error) {
    console.error('Error in GET /api/integrations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
