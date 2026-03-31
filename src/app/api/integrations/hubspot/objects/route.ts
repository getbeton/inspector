/**
 * GET /api/integrations/hubspot/objects
 *
 * Lists available CRM object types (schemas) for a HubSpot connection.
 *
 * Query params:
 *   - connection_id: HubSpot connection UUID (required)
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { getHubSpotConnectionCredentials } from '@/lib/integrations/hubspot/config'
import { HubSpotClient } from '@/lib/integrations/hubspot/client'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot Objects]')

export async function GET(request: Request) {
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

    const url = new URL(request.url)
    const connectionId = url.searchParams.get('connection_id')

    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 })
    }

    // Verify connection belongs to this workspace
    const { data: connection } = await supabase
      .from('hubspot_connections' as never)
      .select('id, workspace_id')
      .eq('id', connectionId)
      .eq('workspace_id', membership.workspaceId)
      .single()

    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Get credentials
    const credentials = await getHubSpotConnectionCredentials(connectionId)
    if (!credentials) {
      return NextResponse.json({ error: 'Failed to load connection credentials' }, { status: 500 })
    }

    // Create client and fetch schemas
    const client = new HubSpotClient({
      token: credentials.token,
      authType: credentials.authType,
      connectionId,
    })

    const schemas = await client.getObjectSchemas()

    // Return simplified object list
    return NextResponse.json({
      objects: schemas.results.map((schema) => ({
        id: schema.id,
        name: schema.name,
        labels: schema.labels,
        primaryDisplayProperty: schema.primaryDisplayProperty,
        archived: schema.archived,
      })),
    })
  } catch (error) {
    log.error('Objects list error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list objects' },
      { status: 500 }
    )
  }
}
