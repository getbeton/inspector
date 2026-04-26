import type { PropKind } from '@/lib/formula'

export type Destination = 'attio' | 'hubspot'

export type ObjectId = 'deals' | 'people' | 'companies' | 'workspaces'

/**
 * Source — discriminated union describing what populates a destination field.
 */
export type Source =
  // Primitive source kinds (v1)
  | { type: 'property'; prop: string; propKind: PropKind; transform?: string }
  | { type: 'formula'; expr: string }
  | { type: 'option'; value: string }
  | { type: 'none' }
  // Entity-linking kinds (record-reference)
  | { type: 'link_subject_person' }
  | { type: 'link_subject_company_by_domain' }
  | { type: 'link_subject_company_via_person' }
  | { type: 'link_specific_record'; targetObject: ObjectId; recordId: string }
  // Entity-linking kinds (actor-reference — workspace member)
  | { type: 'actor_subject_email' }
  | { type: 'actor_account_owner' }

/** Workspace member record exposed to the UI (via /api/.../workspace-members). */
export interface WorkspaceMember {
  id: string
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  accessLevel: string
}

/** Per-field outcome from the adapter's link-resolution pass. */
export interface LinkOutcome {
  fieldId: string
  /**
   * matched   — pre-existing record found and linked.
   * created   — new record was created and linked.
   * resolved  — non-link source evaluated normally; no CRM lookup.
   * null      — source evaluated to nothing (missing subject data etc.).
   * error     — Attio rejected the lookup/assert.
   */
  status: 'matched' | 'created' | 'resolved' | 'null' | 'error'
  recordId?: string
  targetObject?: ObjectId
  webUrl?: string
  reason?: string
}

/**
 * Aggregated ImpactPanel summary (used by /preview-impact).
 */
export interface ImpactSummary {
  objectId: ObjectId
  sampleSize: number
  byField: Array<{
    fieldId: string
    fieldLabel: string
    matched: number
    created: number
    null: number
    errors: number
  }>
}

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
  kind: string              // 'text' | 'select' | 'number' | 'date' | 'email' | 'record' | 'actor' | ...
  required: boolean
  group?: string            // UI grouping hint (Core / Timeline / etc.)
  options?: string[]        // for select / multi-select
  recordHint?: string       // for record-type (e.g. "Company", "Person")
  /** True when the destination expects an array shape (multi-select, domains, emails, ...). */
  isMulti?: boolean
  /** For record-reference fields: which ObjectId the reference points to. */
  targetObjectId?: ObjectId
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
  /** Per-row resolution outcomes from the adapter's link pass. */
  outcomes?: LinkOutcome[]
  /** URL to the created/updated record in Attio's web UI. */
  webUrl?: string
}

export interface FetchSampleSubjectsOptions {
  limit?: number
}
