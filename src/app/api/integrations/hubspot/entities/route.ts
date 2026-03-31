import { NextRequest, NextResponse } from 'next/server'
import { requireWorkspace } from '@/lib/supabase/server'
import {
  resolveHubSpotConnection,
  getHubSpotConnectionCredentials,
  HubSpotRateLimitError,
  HubSpotValidationError,
} from '@/lib/integrations/hubspot'
import { HubSpotClient } from '@/lib/integrations/hubspot/client'
import {
  upsertCompany,
  upsertContact,
  createDeal,
  batchCreateChain,
  buildHubSpotUrl,
  ensureBetonProperties,
} from '@/lib/integrations/hubspot/entities'
import type { EntityResult } from '@/lib/integrations/hubspot/entities'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SingleEntityRequest {
  connection_id?: string
  object_type: 'companies' | 'contacts' | 'deals'
  properties: Record<string, unknown>
  matching_property?: string
}

interface BatchEntityRequest {
  connection_id?: string
  create_company?: boolean
  create_contact?: boolean
  create_deal?: boolean
  company_data?: Record<string, unknown>
  contact_data?: Record<string, unknown>
  deal_data?: Record<string, unknown>
  ensure_properties?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ALLOWED_OBJECT_TYPES = new Set(['companies', 'contacts', 'deals'])

/**
 * Create a HubSpotClient from connection credentials.
 */
async function buildClient(
  connectionId: string
): Promise<{ client: HubSpotClient; portalId: string | null }> {
  const creds = await getHubSpotConnectionCredentials(connectionId)
  if (!creds) {
    throw new Error('HubSpot connection not found or credentials unavailable')
  }
  if (!creds.isActive) {
    throw new Error('HubSpot connection is not active')
  }

  const client = new HubSpotClient({
    token: creds.token,
    authType: creds.authType,
    connectionId,
    refreshToken: creds.refreshToken || undefined,
    tokenExpiresAt: creds.tokenExpiresAt,
  })

  return { client, portalId: creds.hubId }
}

// ---------------------------------------------------------------------------
// POST /api/integrations/hubspot/entities
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { workspaceId } = await requireWorkspace()

    const body = await request.json()

    // Resolve connection (explicit or primary)
    const connection = await resolveHubSpotConnection(workspaceId, body.connection_id)
    if (!connection) {
      return NextResponse.json(
        { error: 'No HubSpot connection found for this workspace' },
        { status: 400 }
      )
    }

    const { client, portalId } = await buildClient(connection.id as string)

    // Route: batch mode vs single entity
    if (
      body.create_company === true ||
      body.create_contact === true ||
      body.create_deal === true
    ) {
      // Validate batch request fields
      if (body.create_company === true && (!body.company_data || typeof body.company_data !== 'object')) {
        return NextResponse.json(
          { error: 'company_data is required when create_company is true' },
          { status: 400 }
        )
      }
      if (body.create_contact === true && (!body.contact_data || typeof body.contact_data !== 'object')) {
        return NextResponse.json(
          { error: 'contact_data is required when create_contact is true' },
          { status: 400 }
        )
      }
      if (body.create_deal === true && (!body.deal_data || typeof body.deal_data !== 'object')) {
        return NextResponse.json(
          { error: 'deal_data is required when create_deal is true' },
          { status: 400 }
        )
      }

      // Optionally ensure beton_* custom properties exist
      if (body.ensure_properties) {
        const objectTypes = new Set<string>()
        if (body.create_company) objectTypes.add('companies')
        if (body.create_contact) objectTypes.add('contacts')
        if (body.create_deal) objectTypes.add('deals')

        for (const ot of objectTypes) {
          try {
            await ensureBetonProperties(client, ot)
          } catch {
            // Non-fatal — entity creation can proceed without custom properties
          }
        }
      }

      return handleBatch(
        client,
        body as BatchEntityRequest,
        portalId
      )
    }

    return handleSingle(client, body as SingleEntityRequest, portalId)
  } catch (err) {
    if (err instanceof Error && err.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (err instanceof Error && err.message.includes('No workspace')) {
      return NextResponse.json({ error: 'No workspace found' }, { status: 404 })
    }
    console.error('[HubSpot Entities] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// Single entity creation
// ---------------------------------------------------------------------------

async function handleSingle(
  client: HubSpotClient,
  body: SingleEntityRequest,
  portalId: string | null
): Promise<NextResponse> {
  const { object_type, properties, matching_property } = body

  if (!object_type || !properties) {
    return NextResponse.json(
      { error: 'object_type and properties are required' },
      { status: 400 }
    )
  }

  if (!ALLOWED_OBJECT_TYPES.has(object_type)) {
    return NextResponse.json({ error: 'Invalid object_type' }, { status: 400 })
  }

  try {
    let result: { recordId: string; action: string; objectType: string }

    switch (object_type) {
      case 'companies':
        result = await upsertCompany(client, properties, matching_property || 'domain')
        break
      case 'contacts':
        result = await upsertContact(client, properties, matching_property || 'email')
        break
      case 'deals':
        result = await createDeal(client, properties)
        break
      default:
        return NextResponse.json({ error: 'Invalid object_type' }, { status: 400 })
    }

    const entity: EntityResult = {
      record_id: result.recordId,
      object_type: result.objectType,
      hubspot_url: buildHubSpotUrl(portalId, result.objectType, result.recordId),
    }

    return NextResponse.json(entity)
  } catch (err) {
    if (err instanceof HubSpotValidationError) {
      return NextResponse.json(
        { error: err.message, type: 'validation' },
        { status: 422 }
      )
    }
    if (err instanceof HubSpotRateLimitError) {
      return NextResponse.json(
        { error: err.message, retry_after: err.retryAfter },
        { status: 429 }
      )
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Batch entity creation: company -> contact -> deal
// ---------------------------------------------------------------------------

async function handleBatch(
  client: HubSpotClient,
  body: BatchEntityRequest,
  portalId: string | null
): Promise<NextResponse> {
  const chainResult = await batchCreateChain(client, {
    portalId,
    companyData: body.company_data,
    contactData: body.contact_data,
    dealData: body.deal_data,
    createCompany: body.create_company,
    createContact: body.create_contact,
    createDeal: body.create_deal,
  })

  if (chainResult.error) {
    return NextResponse.json(
      {
        error: chainResult.error,
        results: chainResult,
        partial: chainResult.partial ?? false,
      },
      { status: 502 }
    )
  }

  return NextResponse.json({ results: chainResult })
}
