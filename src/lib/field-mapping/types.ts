import type { PropKind } from '@/lib/formula'

export type Destination = 'attio' | 'hubspot'

export type ObjectId = 'deals' | 'people' | 'companies' | 'workspaces'

/**
 * Source — discriminated union describing what populates a destination field.
 * Mirrors the prototype's source model, but typed.
 */
export type Source =
  | { type: 'property'; prop: string; propKind: PropKind; transform?: string }
  | { type: 'formula'; expr: string }
  | { type: 'option'; value: string }
  | { type: 'none' }

/** One mapping row: destination field + source + metadata. */
export interface MappingRow {
  id?: string
  fieldId: string
  source: Source
  savedAt?: string | null
  matchOn?: string | null
}

/** Schema of a destination field (Attio attribute / HubSpot property). */
export interface FieldSchema {
  id: string
  label: string
  kind: string              // 'text' | 'select' | 'number' | 'date' | 'email' | 'record' | ...
  required: boolean
  group?: string            // UI grouping hint (Core / Timeline / etc.)
  options?: string[]        // for select / multi-select
  recordHint?: string       // for record-type (e.g. "Company", "Person")
}

/** Schema of a destination object (Deals / People / …). */
export interface ObjectSchema {
  id: ObjectId
  label: string
  description?: string
  fields: FieldSchema[]
  /** PostHog kind this object's subjects come from. */
  subjectKind: 'person' | 'group_org'
}

/** A sample subject — used for live preview and test sends. */
export interface SampleSubject {
  id: string
  name: string
  email?: string
  domain?: string
  distinctId?: string
  lastSeen?: string
  memberCount?: number
  props: Record<string, unknown>
}

/** Result of sending a test record. */
export interface SendTestResult {
  status: 'success' | 'error'
  code: string | number
  title: string
  detail: string
  /** Extra action the UI can surface (e.g. "Reconnect Attio"). */
  action?: string
  /** Field that caused a validation error, if any. */
  field?: string
  /** Payload that was sent (null if build failed). */
  payload?: Record<string, unknown> | null
}

export interface FetchSampleSubjectsOptions {
  limit?: number
}
