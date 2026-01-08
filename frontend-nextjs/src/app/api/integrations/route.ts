import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
    const { data: memberData } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .single()

    if (!memberData) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }

    // Get all integration configs
    const { data: integrations, error } = await supabase
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
      .eq('workspace_id', memberData.workspace_id)

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
              ...config.config_json,
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
