/**
 * Source connector types.
 *
 * A source connector reads CRM / event records INTO the warehouse, the mirror
 * image of the destination/field-mapping framework (`@/lib/field-mapping`),
 * which writes records OUT. Canonical objects (`ObjectId`) are shared with that
 * framework so source records and destination mappings line up.
 */
import type { ObjectId } from '@/lib/field-mapping/types'

/**
 * Source connectors that read records in. Extend this union as connectors land.
 * (Distinct from field-mapping's `Destination`, which writes out.)
 */
export type SourceConnector = 'hubspot' | 'pipedrive' | 'zoho' | 'segment'

/** A source object type, normalized to a canonical `ObjectId` where it corresponds. */
export interface SourceObjectSchema {
  /** Source-native object key, in the source's own casing (HubSpot `contacts`, Zoho `Contacts`). */
  nativeId: string
  /** Canonical object if this maps to one (`people`/`companies`/`deals`); `null` if source-specific. */
  canonical: ObjectId | null
  /** Human-readable label for the mapping UI. */
  label: string
  /** PostHog subject kind this object aligns to, when canonical. */
  subjectKind?: 'person' | 'group_org'
}

/** Schema of a single source field/property (powers source-side field mapping). */
export interface SourceFieldSchema {
  id: string
  label: string
  /** 'text' | 'number' | 'date' | 'email' | 'enum' | ... — source-reported, free-form. */
  kind: string
  /** True when the source field carries an array shape (multi-select, domains, ...). */
  isMulti?: boolean
}

/** One record pulled from a source, normalized for landing in the warehouse. */
export interface SourceRecord {
  /** Source-native record id. */
  externalId: string
  /** Normalized field values keyed by field id. */
  values: Record<string, unknown>
  /** ISO-8601 last-modified timestamp; advances the incremental sync watermark. `null` if unknown. */
  updatedAt: string | null
}

/** One page of a paginated, incremental pull. */
export interface RecordPage {
  records: SourceRecord[]
  /** Opaque cursor for the next page; `null` when the result set is exhausted. */
  nextCursor: string | null
  /** Max `updatedAt` seen in this page; the caller persists it as the next watermark. `null` if none. */
  maxUpdatedAt: string | null
}

/** Options for an incremental, paginated source pull. */
export interface ListRecordsOptions {
  /** Pagination cursor returned by the previous page. */
  cursor?: string
  /** Requested page size; the connector clamps to its own maximum. */
  limit?: number
  /** Incremental watermark — return only records modified at or after this ISO-8601 timestamp. */
  since?: string
}
