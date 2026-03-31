import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import {
  resolveHubSpotConnection,
  getHubSpotConnectionCredentials,
} from '@/lib/integrations/hubspot'
import { HubSpotClient } from '@/lib/integrations/hubspot/client'
import {
  createAssociation,
  batchCreateAssociations,
} from '@/lib/integrations/hubspot/associations'

// ---------------------------------------------------------------------------
// POST /api/integrations/hubspot/associations
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()

    const body = await request.json()

    // Resolve connection
    const connection = await resolveHubSpotConnection(workspaceId, body.connection_id)
    if (!connection) {
      return NextResponse.json(
        { error: 'No HubSpot connection found for this workspace' },
        { status: 400 }
      )
    }

    const creds = await getHubSpotConnectionCredentials(connection.id as string)
    if (!creds || !creds.isActive) {
      return NextResponse.json(
        { error: 'HubSpot connection credentials unavailable' },
        { status: 400 }
      )
    }

    const client = new HubSpotClient({
      token: creds.token,
      authType: creds.authType,
      connectionId: connection.id as string,
      refreshToken: creds.refreshToken || undefined,
      tokenExpiresAt: creds.tokenExpiresAt,
    })

    // Batch mode
    if (Array.isArray(body.associations)) {
      const { associations } = body as {
        associations: Array<{
          from_type: string
          from_id: string
          to_type: string
          to_id: string
          association_type_id?: number
        }>
      }

      if (associations.length === 0) {
        return NextResponse.json(
          { error: 'associations array must not be empty' },
          { status: 400 }
        )
      }

      const inputs = associations.map((a) => ({
        fromType: a.from_type,
        fromId: a.from_id,
        toType: a.to_type,
        toId: a.to_id,
        associationTypeId: a.association_type_id,
      }))

      const result = await batchCreateAssociations(client, inputs)

      return NextResponse.json(result, { status: 201 })
    }

    // Single association
    const { from_type, from_id, to_type, to_id, association_type_id } = body

    if (!from_type || !from_id || !to_type || !to_id) {
      return NextResponse.json(
        { error: 'from_type, from_id, to_type, and to_id are required' },
        { status: 400 }
      )
    }

    await createAssociation(
      client,
      from_type,
      from_id,
      to_type,
      to_id,
      association_type_id
    )

    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[HubSpot Associations] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
