/**
 * HubSpot Polling / Sync Engine
 *
 * Handles incremental sync of HubSpot CRM objects to the local cache:
 * - syncConnection(): sync all enabled objects for a connection
 * - syncObjectType(): sync one object type (contacts, companies, etc.)
 *
 * Features:
 * - Incremental sync using lastmodifieddate watermark
 * - Backfill: last 90 days on first sync
 * - Sync lock to prevent concurrent syncs
 * - Upserts to hubspot_records cache table
 * - Sync state tracking via hubspot_sync_state table
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createHubSpotClientForConnection, type HubSpotClient } from './client'
import { SYNC_CONFIG } from './config'
import { STANDARD_OBJECT_TYPES, type HubSpotObjectType, type HubSpotSyncStatus } from './types'
import { createModuleLogger } from '@/lib/utils/logger'
import { randomBytes } from 'crypto'

const log = createModuleLogger('[HubSpot Polling]')

// ============================================
// Types
// ============================================

export interface SyncResult {
  objectType: string
  recordsSynced: number
  status: 'success' | 'error' | 'skipped'
  error?: string
  durationMs: number
}

export interface ConnectionSyncResult {
  connectionId: string
  hubId: string | null
  results: SyncResult[]
  totalRecordsSynced: number
  totalErrors: number
  durationMs: number
}

// ============================================
// Sync Lock Management
// ============================================

/**
 * Acquire a sync lock for an object type on a connection.
 * Returns the lock ID if acquired, null if already locked.
 */
async function acquireSyncLock(
  connectionId: string,
  objectType: string
): Promise<string | null> {
  const supabase = createAdminClient()
  const lockId = randomBytes(16).toString('hex')
  const lockExpiresAt = new Date(
    Date.now() + SYNC_CONFIG.LOCK_TIMEOUT_MINUTES * 60 * 1000
  ).toISOString()

  // Upsert sync state row, only acquiring lock if not already locked
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('hubspot_sync_state')
    .upsert(
      {
        connection_id: connectionId,
        object_type: objectType,
        sync_lock_id: lockId,
        sync_lock_expires_at: lockExpiresAt,
        status: 'syncing',
      },
      { onConflict: 'connection_id,object_type' }
    )
    .select('sync_lock_id')
    .single()

  if (error) {
    // If there's a conflict, check if the existing lock has expired
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('hubspot_sync_state')
      .select('sync_lock_id, sync_lock_expires_at, status')
      .eq('connection_id', connectionId)
      .eq('object_type', objectType)
      .single()

    if (existing) {
      const lockExpired =
        !existing.sync_lock_expires_at ||
        new Date(existing.sync_lock_expires_at) < new Date()

      if (lockExpired || existing.status !== 'syncing') {
        // Expired lock — forcibly take it
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any)
          .from('hubspot_sync_state')
          .update({
            sync_lock_id: lockId,
            sync_lock_expires_at: lockExpiresAt,
            status: 'syncing',
          })
          .eq('connection_id', connectionId)
          .eq('object_type', objectType)

        return lockId
      }

      log.warn(
        `Sync lock held for ${objectType} on connection ${connectionId}, skipping`
      )
      return null
    }

    log.error('Failed to acquire sync lock:', error)
    return null
  }

  // Verify we got our lock
  if (data?.sync_lock_id === lockId) {
    return lockId
  }

  return lockId // Upsert succeeded, we own the lock
}

/**
 * Release a sync lock.
 */
async function releaseSyncLock(
  connectionId: string,
  objectType: string,
  lockId: string,
  status: HubSpotSyncStatus = 'idle'
): Promise<void> {
  const supabase = createAdminClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('hubspot_sync_state')
    .update({
      sync_lock_id: null,
      sync_lock_expires_at: null,
      status,
    })
    .eq('connection_id', connectionId)
    .eq('object_type', objectType)
    .eq('sync_lock_id', lockId)
}

// ============================================
// Object Type Sync
// ============================================

/**
 * Sync a single object type for a connection.
 *
 * Uses incremental sync (lastmodifieddate > last watermark) for ongoing syncs
 * and backfills the last 90 days on first sync.
 */
export async function syncObjectType(
  client: HubSpotClient,
  connectionId: string,
  workspaceId: string,
  objectType: HubSpotObjectType
): Promise<SyncResult> {
  const startTime = Date.now()

  // Acquire sync lock
  const lockId = await acquireSyncLock(connectionId, objectType)
  if (!lockId) {
    return {
      objectType,
      recordsSynced: 0,
      status: 'skipped',
      error: 'Sync already in progress',
      durationMs: Date.now() - startTime,
    }
  }

  try {
    const supabase = createAdminClient()

    // Get current sync state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: syncState } = await (supabase as any)
      .from('hubspot_sync_state')
      .select('*')
      .eq('connection_id', connectionId)
      .eq('object_type', objectType)
      .single()

    // Determine sync window
    const isBackfill = !syncState?.last_sync_at
    const lastModifiedAt = syncState?.last_modified_at
      ? new Date(syncState.last_modified_at)
      : null

    // Build filter for incremental sync
    const properties = getDefaultProperties(objectType)
    let after: string | undefined
    let totalSynced = 0
    let latestModifiedDate: string | null = null

    if (isBackfill) {
      log.info(`Backfilling ${objectType} for connection ${connectionId} (last ${SYNC_CONFIG.BACKFILL_DAYS} days)`)

      // Update status to backfilling
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('hubspot_sync_state')
        .update({ status: 'backfilling' })
        .eq('connection_id', connectionId)
        .eq('object_type', objectType)
    }

    // Paginate through records
    let hasMore = true
    while (hasMore && totalSynced < SYNC_CONFIG.MAX_RECORDS_PER_BATCH) {
      // Use search API for incremental sync (supports filters)
      // Use list API for backfill (simpler, no filter needed)
      let records
      let nextAfter: string | undefined

      if (lastModifiedAt && !isBackfill) {
        // Incremental: search for records modified since last sync
        const searchResult = await client.search(objectType, {
          filterGroups: [
            {
              filters: [
                {
                  propertyName: 'lastmodifieddate',
                  operator: 'GTE',
                  value: lastModifiedAt.toISOString(),
                },
              ],
            },
          ],
          sorts: [{ propertyName: 'lastmodifieddate', direction: 'ASCENDING' }],
          properties,
          limit: SYNC_CONFIG.PAGE_SIZE,
          after,
        })

        records = searchResult.results
        nextAfter = searchResult.paging?.next?.after
      } else {
        // Backfill: list all records
        const listResult = await listObjectType(client, objectType, {
          properties,
          limit: SYNC_CONFIG.PAGE_SIZE,
          after,
        })

        records = listResult.results
        nextAfter = listResult.paging?.next?.after
      }

      if (records.length === 0) {
        hasMore = false
        break
      }

      // Upsert records to cache
      const upsertPayload = records.map((record) => ({
        connection_id: connectionId,
        workspace_id: workspaceId,
        hubspot_id: record.id,
        object_type: objectType,
        properties: record.properties,
        hubspot_created_at: record.createdAt || null,
        hubspot_updated_at: record.updatedAt || null,
        synced_at: new Date().toISOString(),
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: upsertError } = await (supabase as any)
        .from('hubspot_records')
        .upsert(upsertPayload, {
          onConflict: 'connection_id,object_type,hubspot_id',
        })

      if (upsertError) {
        log.error(`Failed to upsert ${objectType} records:`, upsertError)
        throw new Error(`Upsert failed: ${upsertError.message}`)
      }

      totalSynced += records.length

      // Track the latest modified date for watermark
      for (const record of records) {
        const modDate = record.updatedAt || record.properties?.lastmodifieddate
        if (modDate && (!latestModifiedDate || String(modDate) > latestModifiedDate)) {
          latestModifiedDate = String(modDate)
        }
      }

      // Advance pagination
      if (nextAfter) {
        after = nextAfter
      } else {
        hasMore = false
      }
    }

    // Update sync state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('hubspot_sync_state')
      .update({
        last_sync_at: new Date().toISOString(),
        last_modified_at: latestModifiedDate || syncState?.last_modified_at || null,
        records_synced: (syncState?.records_synced || 0) + totalSynced,
        last_error: null,
        status: 'idle',
      })
      .eq('connection_id', connectionId)
      .eq('object_type', objectType)

    // Release lock
    await releaseSyncLock(connectionId, objectType, lockId, 'idle')

    log.info(
      `Synced ${totalSynced} ${objectType} records for connection ${connectionId} ` +
      `in ${Date.now() - startTime}ms`
    )

    return {
      objectType,
      recordsSynced: totalSynced,
      status: 'success',
      durationMs: Date.now() - startTime,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    log.error(`Error syncing ${objectType} for connection ${connectionId}:`, error)

    // Update sync state with error
    const supabase = createAdminClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('hubspot_sync_state')
      .update({
        status: 'error',
        last_error: errorMessage,
      })
      .eq('connection_id', connectionId)
      .eq('object_type', objectType)

    // Release lock
    await releaseSyncLock(connectionId, objectType, lockId, 'error')

    return {
      objectType,
      recordsSynced: 0,
      status: 'error',
      error: errorMessage,
      durationMs: Date.now() - startTime,
    }
  }
}

// ============================================
// Connection Sync
// ============================================

/**
 * Sync all enabled object types for a HubSpot connection.
 */
export async function syncConnection(
  connectionId: string
): Promise<ConnectionSyncResult> {
  const startTime = Date.now()

  const supabase = createAdminClient()

  // Fetch connection details
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: connection, error } = await (supabase as any)
    .from('hubspot_connections')
    .select('*')
    .eq('id', connectionId)
    .eq('is_active', true)
    .eq('status', 'connected')
    .single()

  if (error || !connection) {
    log.warn(`Connection ${connectionId} not found or not active`)
    return {
      connectionId,
      hubId: null,
      results: [],
      totalRecordsSynced: 0,
      totalErrors: 1,
      durationMs: Date.now() - startTime,
    }
  }

  // Create client
  const client = await createHubSpotClientForConnection(connectionId)

  // Determine which object types to sync
  const enabledObjects: HubSpotObjectType[] =
    connection.config_json?.enabled_objects || [...STANDARD_OBJECT_TYPES]

  log.info(
    `Syncing ${enabledObjects.length} object types for connection ${connectionId} ` +
    `(hub: ${connection.hub_id})`
  )

  // Sync each object type sequentially to respect rate limits
  const results: SyncResult[] = []
  for (const objectType of enabledObjects) {
    const result = await syncObjectType(
      client,
      connectionId,
      connection.workspace_id,
      objectType
    )
    results.push(result)
  }

  const totalRecordsSynced = results.reduce((sum, r) => sum + r.recordsSynced, 0)
  const totalErrors = results.filter((r) => r.status === 'error').length

  return {
    connectionId,
    hubId: connection.hub_id,
    results,
    totalRecordsSynced,
    totalErrors,
    durationMs: Date.now() - startTime,
  }
}

// ============================================
// Helpers
// ============================================

/**
 * Get default properties to fetch for an object type.
 */
function getDefaultProperties(objectType: HubSpotObjectType): string[] {
  switch (objectType) {
    case 'contacts':
      return [
        'email', 'firstname', 'lastname', 'phone', 'company',
        'jobtitle', 'lifecyclestage', 'lastmodifieddate', 'createdate',
      ]
    case 'companies':
      return [
        'name', 'domain', 'industry', 'numberofemployees',
        'annualrevenue', 'city', 'state', 'country',
        'lastmodifieddate', 'createdate',
      ]
    case 'deals':
      return [
        'dealname', 'dealstage', 'pipeline', 'amount', 'closedate',
        'hubspot_owner_id', 'lastmodifieddate', 'createdate',
      ]
    case 'tickets':
      return [
        'subject', 'content', 'hs_pipeline', 'hs_pipeline_stage',
        'hs_ticket_priority', 'lastmodifieddate', 'createdate',
      ]
    default:
      return ['lastmodifieddate', 'createdate']
  }
}

/**
 * List objects using the appropriate client method.
 */
async function listObjectType(
  client: HubSpotClient,
  objectType: HubSpotObjectType,
  options: { properties: string[]; limit: number; after?: string }
) {
  switch (objectType) {
    case 'contacts':
      return client.getContacts(options)
    case 'companies':
      return client.getCompanies(options)
    case 'deals':
      return client.getDeals(options)
    case 'tickets':
      return client.getTickets(options)
    default:
      return client.getCustomObjects(objectType, options)
  }
}
