import { createClient, requireWorkspace } from '@/lib/supabase/server'
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

// ---------------------------------------------------------------------------
// Hardcoded fallback — used when migration 018 has not been applied yet.
// Once the `integration_definitions` table exists the DB rows take precedence.
// ---------------------------------------------------------------------------
const FALLBACK_DEFINITIONS: DefinitionRow[] = [
  {
    id: 'fallback-posthog',
    name: 'posthog',
    display_name: 'PostHog',
    description: 'Product analytics and event tracking',
    category: 'data_source',
    icon_url: null,
    icon_url_light: null,
    required: true,
    display_order: 10,
    setup_step_key: 'posthog',
    supports_self_hosted: true,
    config_schema: null,
  },
  {
    id: 'fallback-attio',
    name: 'attio',
    display_name: 'Attio',
    description: 'CRM for relationship management',
    category: 'crm',
    icon_url: null,
    icon_url_light: null,
    required: true,
    display_order: 20,
    setup_step_key: 'attio',
    supports_self_hosted: false,
    config_schema: null,
  },
  {
    id: 'fallback-firecrawl',
    name: 'firecrawl',
    display_name: 'Firecrawl',
    description: 'Web scraping and crawling',
    category: 'web_scraping',
    icon_url: null,
    icon_url_light: null,
    required: false,
    display_order: 60,
    setup_step_key: 'firecrawl',
    supports_self_hosted: true,
    config_schema: null,
  },
  {
    id: 'fallback-slack',
    name: 'slack',
    display_name: 'Slack',
    description: 'Send signal notifications to a Slack channel when product usage signals are detected.',
    category: 'notification',
    icon_url: null,
    icon_url_light: null,
    required: false,
    display_order: 70,
    setup_step_key: 'slack',
    supports_self_hosted: false,
    config_schema: null,
  },
]

/**
 * GET /api/integrations/definitions
 *
 * Returns all integration definitions from the registry, enriched with
 * the current workspace's connection status from integration_configs.
 *
 * Falls back to hardcoded definitions when the `integration_definitions`
 * table does not yet exist (pre-migration 018).
 */
export async function GET() {
  try {
    const { workspaceId } = await requireWorkspace()
    const supabase = await createClient()

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
        .eq('workspace_id', workspaceId),
    ])

    // Use DB rows when available; fall back to hardcoded definitions when the
    // integration_definitions table doesn't exist yet (pre-migration 018).
    const definitions: DefinitionRow[] = definitionsResult.error
      ? FALLBACK_DEFINITIONS
      : (definitionsResult.data as DefinitionRow[])

    if (definitionsResult.error) {
      console.warn(
        'integration_definitions table unavailable, using fallback:',
        definitionsResult.error.message
      )
    }

    // Configs table may also be missing; treat as empty (no connections).
    const configs: ConfigRow[] = configsResult.error
      ? []
      : (configsResult.data as ConfigRow[])

    if (configsResult.error) {
      console.warn(
        'integration_configs query failed, assuming no connections:',
        configsResult.error.message
      )
    }

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
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('Error in GET /api/integrations/definitions:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
