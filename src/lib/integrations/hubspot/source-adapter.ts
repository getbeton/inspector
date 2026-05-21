/**
 * HubSpot SourceAdapter — reads HubSpot CRM records IN for the warehouse.
 *
 * Implements the framework `SourceAdapter` (`@/lib/integrations/source`) over the
 * HubSpot client. Object keys are the source-native `contacts`/`companies`/`deals`,
 * normalized to canonical `ObjectId` via the source framework. Incremental pulls
 * use HubSpot search filtered on `hs_lastmodifieddate >= since`; full pulls use the
 * list endpoints. Durable scheduling + landing is the F1 runner's job — this only
 * exposes per-page reads + the watermark (`maxUpdatedAt`).
 */
import { createHubSpotClientForWorkspace, type HubSpotClient } from './client'
import { SYNC_CONFIG } from './config'
import type { HubSpotPropertyDefinition, HubSpotRecord } from './types'
import {
  canonicalObjectId,
  subjectKindFor,
  type ListRecordsOptions,
  type RecordPage,
  type SourceAdapter,
  type SourceFieldSchema,
  type SourceObjectSchema,
  type SourceRecord,
} from '@/lib/integrations/source'

/** The subset of the HubSpot client the source adapter depends on (injectable for tests). */
export type HubSpotSourceClient = Pick<
  HubSpotClient,
  'testConnection' | 'getContacts' | 'getCompanies' | 'getDeals' | 'getProperties' | 'search'
>

/** Source-native objects HubSpot exposes through this adapter, in display order. */
const OBJECTS: ReadonlyArray<{ nativeId: string; label: string }> = [
  { nativeId: 'contacts', label: 'Contacts' },
  { nativeId: 'companies', label: 'Companies' },
  { nativeId: 'deals', label: 'Deals' },
]
const SUPPORTED = new Set(OBJECTS.map((o) => o.nativeId))

const LAST_MODIFIED = 'hs_lastmodifieddate'

export interface HubSpotSourceAdapterDeps {
  /** Resolve the HubSpot client for a workspace. Defaults to the integration_configs-backed factory. */
  getClient?: (workspaceId: string) => Promise<HubSpotSourceClient>
}

export function createHubSpotSourceAdapter(deps: HubSpotSourceAdapterDeps = {}): SourceAdapter {
  const getClient = deps.getClient ?? ((workspaceId: string) => createHubSpotClientForWorkspace(workspaceId))

  function assertSupported(object: string): void {
    if (!SUPPORTED.has(object)) {
      throw new Error(`Unsupported HubSpot object: ${object}`)
    }
  }

  return {
    source: 'hubspot',

    async testConnection(workspaceId: string): Promise<{ ok: boolean; error?: string }> {
      const client = await getClient(workspaceId)
      const result = await client.testConnection()
      return result.success ? { ok: true } : { ok: false, error: result.error }
    },

    async listObjects(): Promise<SourceObjectSchema[]> {
      return OBJECTS.map(({ nativeId, label }) => {
        const canonical = canonicalObjectId('hubspot', nativeId)
        return { nativeId, canonical, label, subjectKind: subjectKindFor(canonical) }
      })
    },

    async listFields(workspaceId: string, object: string): Promise<SourceFieldSchema[]> {
      assertSupported(object)
      const client = await getClient(workspaceId)
      const { results } = await client.getProperties(object)
      return results.map(propToFieldSchema)
    },

    async listRecords(
      workspaceId: string,
      object: string,
      options: ListRecordsOptions = {},
    ): Promise<RecordPage> {
      assertSupported(object)
      const client = await getClient(workspaceId)
      const limit = options.limit ?? SYNC_CONFIG.PAGE_SIZE

      let rawRecords: HubSpotRecord[]
      let nextAfter: string | undefined

      if (options.since) {
        // Incremental: search for records modified at/after the watermark, oldest first.
        const res = await client.search(object, {
          filterGroups: [
            { filters: [{ propertyName: LAST_MODIFIED, operator: 'GTE', value: String(Date.parse(options.since)) }] },
          ],
          sorts: [{ propertyName: LAST_MODIFIED, direction: 'ASCENDING' }],
          after: options.cursor ?? '0',
          limit,
        })
        rawRecords = res.results
        nextAfter = res.paging?.next?.after
      } else {
        // Full pull via the list endpoint for the object.
        const list = await listFor(client, object, { limit, after: options.cursor })
        rawRecords = list.results
        nextAfter = list.paging?.next?.after
      }

      const records = rawRecords.map(toSourceRecord)
      return {
        records,
        nextCursor: nextAfter ?? null,
        maxUpdatedAt: maxUpdatedAt(records),
      }
    },
  }
}

function listFor(
  client: HubSpotSourceClient,
  object: string,
  opts: { limit: number; after?: string },
) {
  switch (object) {
    case 'contacts':
      return client.getContacts(opts)
    case 'companies':
      return client.getCompanies(opts)
    case 'deals':
      return client.getDeals(opts)
    default:
      // assertSupported already guards this; keep the switch total for the type checker.
      throw new Error(`Unsupported HubSpot object: ${object}`)
  }
}

function propToFieldSchema(p: HubSpotPropertyDefinition): SourceFieldSchema {
  return {
    id: p.name,
    label: p.label,
    // HubSpot 'string' is plain text; everything else passes through as its semantic type.
    kind: p.type === 'string' ? 'text' : p.type,
    // HubSpot 'checkbox' fieldType = multiple checkboxes (array); 'booleancheckbox' = single boolean.
    isMulti: p.fieldType === 'checkbox',
  }
}

function toSourceRecord(r: HubSpotRecord): SourceRecord {
  const props = r.properties as Record<string, unknown>
  const updatedAt = r.updatedAt || (props.lastmodifieddate as string | undefined) || null
  return { externalId: r.id, values: props, updatedAt }
}

function maxUpdatedAt(records: SourceRecord[]): string | null {
  let best: string | null = null
  let bestT = -Infinity
  for (const r of records) {
    if (!r.updatedAt) continue
    const t = Date.parse(r.updatedAt)
    if (!Number.isNaN(t) && t > bestT) {
      bestT = t
      best = r.updatedAt
    }
  }
  return best
}
