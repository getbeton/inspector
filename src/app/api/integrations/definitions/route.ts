import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { NextResponse } from 'next/server'
import type { IntegrationCategory, IntegrationDefinition } from '@/lib/integrations/types'

interface DefinitionRow {
  id: string
  name: string
  display_name: string
  description: string
  category: IntegrationCategory
  icon_url: string | null
  icon_url_light: string | null
  required: boolean
  display_order: number
  setup_step_key: string | null
  supports_self_hosted: boolean
  config_schema: Record<string, unknown> | null
}

interface ConfigRow {
  integration_name: string
  status: string
  last_validated_at: string | null
  is_active: boolean
}

/**
 * GET /api/integrations/definitions
 *
 * Returns all integration definitions from the registry, enriched with
 * the current workspace's connection status from integration_configs.
 */
export async function GET() {
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

    // Two parallel queries: definitions (global) + configs (workspace-scoped)
    const [definitionsResult, configsResult] = await Promise.all([
      supabase
        .from('integration_definitions')
        .select(
          'id, name, display_name, description, category, icon_url, icon_url_light, required, display_order, setup_step_key, supports_self_hosted, config_schema'
        )
        .order('display_order', { ascending: true }),
      supabase
        .from('integration_configs')
        .select('integration_name, status, last_validated_at, is_active')
        .eq('workspace_id', membership.workspaceId),
    ])

    if (definitionsResult.error) {
      console.error('Error fetching integration definitions:', definitionsResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch integration definitions' },
        { status: 500 }
      )
    }

    if (configsResult.error) {
      console.error('Error fetching integration configs:', configsResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch integration configs' },
        { status: 500 }
      )
    }

    const definitions = definitionsResult.data as DefinitionRow[]
    const configs = configsResult.data as ConfigRow[]

    // Build a lookup map: integration_name → config
    const configMap = new Map(
      configs.map((c) => [c.integration_name, c])
    )

    // Enrich each definition with workspace connection status
    const enriched: IntegrationDefinition[] = definitions.map((def) => {
      const config = configMap.get(def.name)
      const isConnected =
        !!config && config.is_active && config.status === 'connected'

      return {
        ...def,
        is_connected: isConnected,
        last_validated_at: config?.last_validated_at ?? null,
      }
    })

    return NextResponse.json({ definitions: enriched })
  } catch (error) {
    console.error('Error in GET /api/integrations/definitions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
