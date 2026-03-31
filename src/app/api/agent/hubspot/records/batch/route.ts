/**
 * POST /api/agent/hubspot/records/batch
 *
 * Agent endpoint to batch create or upsert CRM records.
 * Maximum 100 records per request.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createModuleLogger } from '@/lib/utils/logger'
import { validateAgentRequest } from '@/lib/agent/auth'
import { rateLimitResponse } from '@/lib/agent/rate-limit'
import { resolveSession } from '@/lib/agent/session'
import { resolveHubSpotConnectionAdmin, getHubSpotConnectionCredentialsAdmin } from '@/lib/integrations/hubspot/config'
import { createHubSpotClient } from '@/lib/integrations/hubspot/client'

const log = createModuleLogger('[API][Agent][HubSpot][BatchRecords]')

const MAX_BATCH_SIZE = 100

interface BatchRecordInput {
  properties: Record<string, string | number | boolean>
}

interface BatchRecordResult {
  index: number
  status: 'created' | 'updated' | 'error'
  record_id?: string
  error?: string
}

export async function POST(req: NextRequest) {
  if (!validateAgentRequest(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { session_id, object_type, records, matching_property, connection_id } = body

    if (!session_id) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })
    }
    if (!object_type) {
      return NextResponse.json({ error: 'Missing object_type' }, { status: 400 })
    }
    if (!Array.isArray(records) || records.length === 0) {
      return NextResponse.json({ error: 'records must be a non-empty array' }, { status: 400 })
    }
    if (records.length > MAX_BATCH_SIZE) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BATCH_SIZE} records per batch. Received ${records.length}.` },
        { status: 400 }
      )
    }

    // Resolve session -> workspace
    let workspaceId: string
    try {
      const session = await resolveSession(session_id)
      workspaceId = session.workspaceId
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Invalid session'
      return NextResponse.json({ error: msg }, { status: 404 })
    }

    // Rate limit per workspace
    const limited = rateLimitResponse(workspaceId)
    if (limited) return limited

    // Resolve connection
    const connection = await resolveHubSpotConnectionAdmin(workspaceId, connection_id)
    if (!connection) {
      return NextResponse.json(
        { error: 'No active HubSpot connection found for this workspace' },
        { status: 404 }
      )
    }

    const credentials = await getHubSpotConnectionCredentialsAdmin(connection.id)
    if (!credentials) {
      return NextResponse.json(
        { error: 'Failed to retrieve HubSpot credentials' },
        { status: 500 }
      )
    }

    const client = createHubSpotClient({
      token: credentials.token,
      authType: credentials.authType,
      connectionId: credentials.connectionId,
      refreshToken: credentials.refreshToken || undefined,
      tokenExpiresAt: credentials.tokenExpiresAt,
    })

    // Process records
    const results: BatchRecordResult[] = []
    let hasErrors = false

    for (let i = 0; i < (records as BatchRecordInput[]).length; i++) {
      const record = (records as BatchRecordInput[])[i]
      try {
        if (!record.properties || typeof record.properties !== 'object') {
          results.push({ index: i, status: 'error', error: 'Missing or invalid properties' })
          hasErrors = true
          continue
        }

        if (matching_property) {
          // Upsert mode: search by matching property
          const matchValue = record.properties[matching_property]
          if (!matchValue) {
            results.push({
              index: i,
              status: 'error',
              error: `Missing matching property "${matching_property}"`,
            })
            hasErrors = true
            continue
          }

          const searchResult = await client.search(object_type, {
            filterGroups: [{
              filters: [{
                propertyName: matching_property,
                operator: 'EQ',
                value: String(matchValue),
              }],
            }],
            limit: 1,
          })

          if (searchResult.results.length > 0) {
            const existingId = searchResult.results[0].id
            await client.updateRecord(object_type, existingId, record.properties)
            results.push({ index: i, status: 'updated', record_id: existingId })
            continue
          }
        }

        // Create new record
        const created = await client.createRecord(object_type, record.properties)
        results.push({ index: i, status: 'created', record_id: created.id })
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Unknown error'
        results.push({ index: i, status: 'error', error: errMsg })
        hasErrors = true
      }
    }

    const created = results.filter(r => r.status === 'created').length
    const updated = results.filter(r => r.status === 'updated').length
    const errors = results.filter(r => r.status === 'error').length

    log.info(
      `Batch ${object_type}: ${created} created, ${updated} updated, ${errors} errors ` +
      `for workspace=${workspaceId}`
    )

    // 207 Multi-Status if some succeeded and some failed
    const httpStatus = hasErrors
      ? (created + updated > 0 ? 207 : 400)
      : 201

    return NextResponse.json({ results, summary: { created, updated, errors } }, { status: httpStatus })
  } catch (e) {
    log.error(`Batch records failed: ${e}`)
    const msg = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
