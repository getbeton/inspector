/**
 * GET  /api/integrations/hubspot/properties — List properties for an object type
 * POST /api/integrations/hubspot/properties — Create a new property
 *
 * Query params (GET):
 *   - connection_id: HubSpot connection UUID (required)
 *   - object_type: CRM object type (required, e.g. 'contacts', 'companies')
 *
 * Body (POST):
 *   - connection_id: HubSpot connection UUID
 *   - object_type: CRM object type
 *   - name: Property internal name
 *   - label: Property display label
 *   - type: Property type (string, number, date, etc.)
 *   - fieldType: Field type (text, textarea, number, date, etc.)
 *   - groupName: Property group
 *   - description: Optional description
 */

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkspaceMembership } from '@/lib/supabase/helpers'
import { getHubSpotConnectionCredentials } from '@/lib/integrations/hubspot/config'
import { HubSpotClient } from '@/lib/integrations/hubspot/client'
import { createModuleLogger } from '@/lib/utils/logger'

const log = createModuleLogger('[HubSpot Properties]')

/**
 * Verify the connection belongs to the user's workspace and get credentials.
 */
async function resolveConnection(
  connectionId: string,
  workspaceId: string
) {
  const supabase = await createClient()

  const { data: connection } = await supabase
    .from('hubspot_connections' as never)
    .select('id, workspace_id')
    .eq('id', connectionId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!connection) {
    return null
  }

  const credentials = await getHubSpotConnectionCredentials(connectionId)
  if (!credentials) {
    return null
  }

  return new HubSpotClient({
    token: credentials.token,
    authType: credentials.authType,
    connectionId,
  })
}

/**
 * GET: List properties for an object type
 */
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
    const objectType = url.searchParams.get('object_type')

    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 })
    }

    if (!objectType) {
      return NextResponse.json({ error: 'object_type is required' }, { status: 400 })
    }

    const client = await resolveConnection(connectionId, membership.workspaceId)
    if (!client) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const properties = await client.getProperties(objectType)

    return NextResponse.json({
      object_type: objectType,
      properties: properties.results,
    })
  } catch (error) {
    log.error('List properties error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list properties' },
      { status: 500 }
    )
  }
}

/**
 * POST: Create a new property on an object type
 */
export async function POST(request: Request) {
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
    const {
      connection_id: connectionId,
      object_type: objectType,
      name,
      label,
      type = 'string',
      fieldType = 'text',
      groupName = 'contactinformation',
      description,
    } = body

    if (!connectionId) {
      return NextResponse.json({ error: 'connection_id is required' }, { status: 400 })
    }

    if (!objectType) {
      return NextResponse.json({ error: 'object_type is required' }, { status: 400 })
    }

    if (!name || !label) {
      return NextResponse.json({ error: 'name and label are required' }, { status: 400 })
    }

    const client = await resolveConnection(connectionId, membership.workspaceId)
    if (!client) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    const property = await client.createProperty(objectType, {
      name,
      label,
      type,
      fieldType,
      groupName,
      description,
    })

    return NextResponse.json({ property }, { status: 201 })
  } catch (error) {
    log.error('Create property error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create property' },
      { status: 500 }
    )
  }
}
